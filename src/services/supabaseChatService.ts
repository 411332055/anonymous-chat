import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { getTabClientId } from '../lib/clientId'
import { charCount, MESSAGE_MAX } from '../lib/validate'
import type {
  ChatEvents,
  ChatService,
  ConnectionStatus,
  JoinResult,
  Message,
  SendResult,
  User,
} from './types'

// 階段二的資料來源:遵守 ChatService 介面,背後是 Supabase。
//  - 訊息:存在 messages 資料表,新增時透過 Realtime 的 Postgres Changes 通知所有人
//  - 在線名單與進出:Realtime 的 Presence
// 畫面層完全不知道這個檔案的存在,只透過 services/index.ts 拿到 ChatService。

const ROOM = 'anonymous-chat-room'
const TABLE = 'messages'
const BACKFILL_LIMIT = 50
const SUBSCRIBE_TIMEOUT_MS = 10_000
/** 加入頻道後,等多久讓「目前在線名單」送過來,才判斷代號有沒有人用 */
const PRESENCE_WAIT_MS = 1500
/** 第一次連不上時,等多久再重試一次 */
const RETRY_DELAY_MS = 1200

interface PresenceMeta {
  nickname: string
  clientId: string
  joinedAt: number
}

/** messages 資料表的一列 */
interface Row {
  id: number | string
  nickname: string
  client_id: string
  text: string
  sent_at: string
}

const toMessage = (r: Row): Message => ({
  id: String(r.id),
  nickname: r.nickname,
  clientId: r.client_id,
  text: r.text,
  sentAt: r.sent_at,
})

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class SupabaseChatService implements ChatService {
  readonly isDemo = false
  // 每個分頁各一個 clientId(重新整理不變),這樣同一個瀏覽器開多個分頁也能分清楚誰是誰
  readonly clientId = getTabClientId()

  private db: SupabaseClient
  private channel: RealtimeChannel | null = null
  private me: User | null = null
  private status: ConnectionStatus = 'connecting'
  /** 目前收到的最大訊息編號,斷線重連後用它補漏掉的訊息 */
  private lastId = 0
  private listeners = new Map<string, Set<(payload: never) => void>>()

  constructor(url: string, anonKey: string) {
    // 這個專案不用登入,所以不需要 Supabase 的登入狀態儲存
    this.db = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    // 手機換網路、電腦睡眠醒來:不等 Realtime 自己發現,馬上檢查並補訊息
    window.addEventListener('offline', () => this.setStatus('reconnecting'))
    window.addEventListener('online', () => void this.recover())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.recover()
    })
  }

  /* ---------------- ChatService ---------------- */

  on<K extends keyof ChatEvents>(event: K, handler: (payload: ChatEvents[K]) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(handler as (payload: never) => void)
    return () => set.delete(handler as (payload: never) => void)
  }

  async join(nickname: string): Promise<JoinResult> {
    if (nickname.length === 0) return { ok: false, reason: 'invalid' }
    // Realtime 閒置一陣子後,第一次連線偶爾會失敗(暖機),馬上再試一次通常就成功。
    // 只針對「連不上」重試;代號被占用這類明確的答案不重試。
    let result = await this.tryJoin(nickname)
    if (!result.ok && result.reason === 'network') {
      await sleep(RETRY_DELAY_MS)
      result = await this.tryJoin(nickname)
    }
    return result
  }

  private async tryJoin(nickname: string): Promise<JoinResult> {
    await this.teardown()

    const channel = this.db.channel(ROOM, { config: { presence: { key: this.clientId } } })
    this.channel = channel

    let firstSync: () => void = () => {}
    const synced = new Promise<void>((r) => (firstSync = r))

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (p) =>
        this.onInsert(p.new as Row),
      )
      .on('presence', { event: 'sync' }, () => {
        firstSync()
        if (this.me) this.emit('presence:sync', this.onlineUsers())
      })
      .on('presence', { event: 'join' }, (p) => {
        for (const m of p.newPresences as unknown as PresenceMeta[]) {
          if (this.me && m.clientId !== this.clientId) this.emit('user:joined', this.toUser(m))
        }
      })
      .on('presence', { event: 'leave' }, (p) => {
        for (const m of p.leftPresences as unknown as PresenceMeta[]) {
          if (this.me && m.clientId !== this.clientId) this.emit('user:left', this.toUser(m))
        }
      })

    const subscribed = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), SUBSCRIBE_TIMEOUT_MS)
      channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          resolve(true)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[chat] 加入頻道失敗:', status, err?.message ?? '')
          clearTimeout(timer)
          resolve(false)
        }
        this.onChannelStatus(status)
      })
    })
    if (!subscribed) {
      await this.teardown()
      return { ok: false, reason: 'network' }
    }

    // 等「目前在線名單」送過來,再判斷代號有沒有人用
    await Promise.race([synced, sleep(PRESENCE_WAIT_MS)])
    const lower = nickname.toLowerCase()
    const taken = this.presenceUsers().some(
      (u) => u.clientId !== this.clientId && u.nickname.toLowerCase() === lower,
    )
    if (taken) {
      await this.teardown()
      return { ok: false, reason: 'nickname_taken' }
    }

    const me: User = { nickname, clientId: this.clientId, joinedAt: Date.now() }
    this.me = me
    const tracked = await channel.track(this.toMeta(me))
    if (tracked !== 'ok') {
      await this.teardown()
      return { ok: false, reason: 'network' }
    }

    try {
      const recent = await this.fetchRecent(BACKFILL_LIMIT)
      this.lastId = recent.reduce((max, m) => Math.max(max, Number(m.id)), 0)
      this.setStatus('connected')
      return { ok: true, recent, online: this.onlineUsers() }
    } catch {
      await this.teardown()
      return { ok: false, reason: 'network' }
    }
  }

  async loadRecent(limit: number): Promise<Message[]> {
    return this.fetchRecent(limit)
  }

  async send(text: string): Promise<SendResult> {
    if (!this.me || this.status !== 'connected') return { ok: false, reason: 'network' }
    if (text.trim().length === 0) return { ok: false, reason: 'empty' }
    if (charCount(text) > MESSAGE_MAX) return { ok: false, reason: 'too_long' }

    // 只寫這三個欄位;編號和時間由資料庫自己產生。
    // 訊息本身會透過 Realtime 回來(含自己),所以這裡不用處理回傳內容。
    const { error } = await this.db
      .from(TABLE)
      .insert({ nickname: this.me.nickname, client_id: this.clientId, text })
    if (error) return { ok: false, reason: error.code === '23514' ? 'too_long' : 'network' }
    return { ok: true }
  }

  async leave(): Promise<void> {
    await this.teardown()
  }

  /* ---------------- Realtime 事件 ---------------- */

  private onInsert(row: Row): void {
    const n = Number(row.id)
    if (n > this.lastId) this.lastId = n
    this.emit('message:new', toMessage(row))
  }

  private onChannelStatus(status: string): void {
    if (!this.me) return // 還在加入中,結果由 join() 自己處理
    if (status === 'SUBSCRIBED') {
      // 斷線後 Supabase 自動重連成功:重新登記在線、補漏掉的訊息
      if (this.status !== 'connected') void this.resume()
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      this.setStatus('reconnecting')
    }
  }

  private async resume(): Promise<void> {
    if (!this.me || !this.channel) return
    await this.channel.track(this.toMeta(this.me))
    await this.recover()
  }

  /** 補上「比我最後一則更新」的訊息;補得到才算真的連上了 */
  private async recover(): Promise<void> {
    if (!this.me || !this.channel) return
    const ok = await this.catchUp()
    if (ok && this.channel.state === 'joined') {
      this.emit('presence:sync', this.onlineUsers())
      this.setStatus('connected')
    }
  }

  private async catchUp(): Promise<boolean> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .gt('id', this.lastId)
      .order('id', { ascending: false })
      .limit(BACKFILL_LIMIT + 1)
    if (error || !data) return false

    // 漏太多就只補最新的,並提示中間有缺漏
    const rows = data as Row[]
    const gap = rows.length > BACKFILL_LIMIT
    const missed = (gap ? rows.slice(0, BACKFILL_LIMIT) : rows).reverse()
    if (gap) this.emit('messages:gap', undefined)
    for (const row of missed) this.onInsert(row)
    return true
  }

  /* ---------------- 資料與工具 ---------------- */

  private async fetchRecent(limit: number): Promise<Message[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .order('id', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data as Row[]).reverse().map(toMessage)
  }

  /** 目前頻道上所有人(含自己以外的),依 clientId 去重 */
  private presenceUsers(): User[] {
    const byId = new Map<string, User>()
    const state = this.channel?.presenceState<PresenceMeta>() ?? {}
    for (const metas of Object.values(state)) {
      for (const m of metas) if (!byId.has(m.clientId)) byId.set(m.clientId, this.toUser(m))
    }
    return [...byId.values()]
  }

  private onlineUsers(): User[] {
    const byId = new Map(this.presenceUsers().map((u) => [u.clientId, u]))
    if (this.me) byId.set(this.me.clientId, this.me)
    return [...byId.values()].sort((a, b) => a.joinedAt - b.joinedAt)
  }

  private toUser = (m: PresenceMeta): User => ({
    nickname: m.nickname,
    clientId: m.clientId,
    joinedAt: m.joinedAt,
  })

  private toMeta = (u: User): PresenceMeta => ({
    nickname: u.nickname,
    clientId: u.clientId,
    joinedAt: u.joinedAt,
  })

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return
    this.status = next
    this.emit('connection:status', next)
  }

  private emit<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    this.listeners.get(event)?.forEach((h) => (h as (p: ChatEvents[K]) => void)(payload))
  }

  /** 離開頻道、清掉狀態(換代號、加入失敗時都會用到) */
  private async teardown(): Promise<void> {
    const channel = this.channel
    this.channel = null
    this.me = null
    this.status = 'connecting'
    if (!channel) return
    try {
      await channel.untrack()
      await this.db.removeChannel(channel)
    } catch {
      /* 已經斷線就算了,伺服器會自己判定離線 */
    }
  }
}
