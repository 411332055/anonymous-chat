import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { getTabClientId } from '../lib/clientId'
import { charCount, MESSAGE_MAX, NICKNAME_MAX } from '../lib/validate'
import { PresenceLiveness } from './presenceLiveness'
import { TypingTracker } from './typingTracker'
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
/** 每隔多久更新一次自己的「心跳」(讓別人知道我還在線上) */
const HEARTBEAT_MS = 8_000
/** 別人超過這麼久沒有更新心跳,就視為已離開(即使伺服器沒通知) */
const LIVENESS_TTL_MS = 30_000
/** 每隔多久重新核對一次「誰還在線上」 */
const RECONCILE_MS = 3_000
const CLIENT_ID_MAX = 64

interface PresenceMeta {
  nickname: string
  clientId: string
  joinedAt: number
  /** 心跳:每次更新都會變的數字,別人靠它判斷我還在不在 */
  beat?: number
}

/** messages 資料表的一列 */
interface Row {
  id: number | string
  nickname: string
  client_id: string
  text: string
  sent_at: string
}

const inRange = (s: string, min: number, max: number) => {
  const n = charCount(s)
  return n >= min && n <= max
}

/** 收到別人推來的資料時,先檢查格式與長度,不合格就丟掉(不顯示、不處理) */
function parseRow(raw: unknown): Row | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const idOk = (typeof r.id === 'number' && Number.isFinite(r.id)) || (typeof r.id === 'string' && r.id !== '')
  if (!idOk) return null
  if (typeof r.nickname !== 'string' || !inRange(r.nickname, 1, NICKNAME_MAX)) return null
  if (typeof r.client_id !== 'string' || !inRange(r.client_id, 1, CLIENT_ID_MAX)) return null
  if (typeof r.text !== 'string' || !inRange(r.text, 1, MESSAGE_MAX)) return null
  if (typeof r.sent_at !== 'string' || Number.isNaN(Date.parse(r.sent_at))) return null
  return { id: r.id as number | string, nickname: r.nickname, client_id: r.client_id, text: r.text, sent_at: r.sent_at }
}

/** 同上,檢查別人登記的在線資料 */
function parseMeta(raw: unknown): PresenceMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.nickname !== 'string' || !inRange(m.nickname, 1, NICKNAME_MAX)) return null
  if (typeof m.clientId !== 'string' || !inRange(m.clientId, 1, CLIENT_ID_MAX)) return null
  if (typeof m.joinedAt !== 'number' || !Number.isFinite(m.joinedAt)) return null
  const beat = typeof m.beat === 'number' && Number.isFinite(m.beat) ? m.beat : undefined
  return { nickname: m.nickname, clientId: m.clientId, joinedAt: m.joinedAt, beat }
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

  // 「正在輸入」:透過 Realtime 的廣播(Broadcast)傳送,不存進資料庫
  private typing = new TypingTracker((users) => this.emit('typing:update', users))
  private lastTypingSent = 0

  // 「誰在線上」:伺服器通知 + 自己核對心跳。兩者合起來,名單才不會卡住已離開的人。
  private liveness = new PresenceLiveness(LIVENESS_TTL_MS)
  /** 目前畫面上認為在線的「別人」(用來產生「進來了/離開了」提示,避免重複) */
  private visible = new Map<string, User>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconcileTimer: ReturnType<typeof setInterval> | null = null

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

    // 關掉分頁、重新整理、換網址:不等伺服器發現,主動告訴大家「我離開了」(盡力而為)
    window.addEventListener('pagehide', () => this.leaveQuietly())
    window.addEventListener('beforeunload', () => this.leaveQuietly())
    // 從瀏覽器的「上一頁快取」還原的頁面,連線早就沒了,重新載入最單純
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) location.reload()
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
        this.onInsert(p.new),
      )
      // 在線狀態有任何變化(同步、加入、離開):統一重新核對「誰在線上」,
      // 由 reconcile 負責比對差異、產生「進來了/離開了」提示與更新名單
      .on('presence', { event: 'sync' }, () => {
        firstSync()
        this.reconcile()
      })
      .on('presence', { event: 'join' }, () => this.reconcile())
      .on('presence', { event: 'leave' }, () => this.reconcile())
      .on('broadcast', { event: 'typing' }, (msg) => {
        const t = parseMeta({ ...(msg.payload as object), joinedAt: 0 })
        if (!this.me || !t || t.clientId === this.clientId) return
        this.typing.touch({ nickname: t.nickname, clientId: t.clientId, joinedAt: 0 })
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
    const taken = this.presenceEntries().some(
      (e) => e.user.clientId !== this.clientId && e.user.nickname.toLowerCase() === lower,
    )
    if (taken) {
      await this.teardown()
      return { ok: false, reason: 'nickname_taken' }
    }

    const me: User = { nickname, clientId: this.clientId, joinedAt: Date.now() }
    this.me = me
    // 先把「現在已經在線的人」記成基準,之後才只對「變化」產生進出提示
    this.visible = new Map(this.aliveOthers().map((u) => [u.clientId, u]))
    const tracked = await channel.track(this.toMeta(me))
    if (tracked !== 'ok') {
      await this.teardown()
      return { ok: false, reason: 'network' }
    }

    try {
      const recent = await this.fetchRecent(BACKFILL_LIMIT)
      this.lastId = recent.reduce((max, m) => Math.max(max, Number(m.id)), 0)
      this.setStatus('connected')
      this.startTimers()
      return { ok: true, recent, online: this.onlineUsers() }
    } catch {
      await this.teardown()
      return { ok: false, reason: 'network' }
    }
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
    if (error) {
      // 資料庫端的規則擋下來的:送太快(自訂錯誤 rate_limited)、超過長度(check constraint)
      if (error.message?.includes('rate_limited')) return { ok: false, reason: 'rate_limited' }
      if (error.code === '23514') return { ok: false, reason: 'too_long' }
      return { ok: false, reason: 'network' }
    }
    return { ok: true }
  }

  /** 使用者正在打字:廣播給其他人(最多每 1.5 秒一次) */
  notifyTyping(): void {
    if (!this.me || !this.channel || this.status !== 'connected') return
    const now = Date.now()
    if (now - this.lastTypingSent < 1500) return
    this.lastTypingSent = now
    void this.channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { nickname: this.me.nickname, clientId: this.clientId },
    })
  }

  async leave(): Promise<void> {
    await this.teardown()
  }

  /* ---------------- Realtime 事件 ---------------- */

  private onInsert(raw: unknown): void {
    const row = parseRow(raw)
    if (!row) return // 格式不對的資料直接丟掉
    const n = Number(row.id)
    if (n > this.lastId) this.lastId = n
    this.typing.clear(row.client_id) // 對方送出訊息了,不再「正在輸入」
    this.emit('message:new', toMessage(row))
  }

  private onChannelStatus(status: string): void {
    if (!this.me) return // 還在加入中,結果由 join() 自己處理
    if (status === 'SUBSCRIBED') {
      // 斷線後 Supabase 自動重連成功:重新登記在線、補漏掉的訊息
      if (this.status !== 'connected') void this.resume()
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      this.typing.reset()
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
      this.reconcile()
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
    const rows = data as unknown[]
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
    return (data as unknown[])
      .reverse()
      .map(parseRow)
      .filter((r): r is Row => r !== null)
      .map(toMessage)
  }

  /** 目前頻道上看得到的所有人(包含自己),依 clientId 去重,格式不對的丟掉 */
  private presenceEntries(): Array<{ user: User; beat: number | null }> {
    const byId = new Map<string, { user: User; beat: number | null }>()
    const state = this.channel?.presenceState() ?? {}
    for (const metas of Object.values(state)) {
      for (const raw of metas) {
        const m = parseMeta(raw)
        if (!m) continue
        const prev = byId.get(m.clientId)
        // 同一個人若有多筆(重新整理時舊連線還沒被清掉),留心跳最新的那筆
        if (!prev || (m.beat ?? -1) > (prev.beat ?? -1)) {
          byId.set(m.clientId, { user: this.toUser(m), beat: m.beat ?? null })
        }
      }
    }
    return [...byId.values()]
  }

  /** 「別人」之中仍然活著的(伺服器還沒通知離開、但心跳停了的人會被排除) */
  private aliveOthers(): User[] {
    const others = this.presenceEntries().filter((e) => e.user.clientId !== this.clientId)
    const alive = this.liveness.update(
      others.map((e) => ({ clientId: e.user.clientId, beat: e.beat })),
      Date.now(),
    )
    return others.filter((e) => alive.has(e.user.clientId)).map((e) => e.user)
  }

  /** 比對「畫面上認為在線的人」和「實際還活著的人」:有差異就發出進出提示並更新名單 */
  private reconcile(): void {
    if (!this.me) return
    const alive = new Map(this.aliveOthers().map((u) => [u.clientId, u]))
    let changed = false
    for (const [id, u] of alive) {
      if (this.visible.has(id)) continue
      this.visible.set(id, u)
      changed = true
      this.emit('user:joined', u)
    }
    for (const [id, u] of [...this.visible]) {
      if (alive.has(id)) continue
      this.visible.delete(id)
      changed = true
      this.typing.clear(id)
      this.emit('user:left', u)
    }
    if (changed) this.emit('presence:sync', this.onlineUsers())
  }

  private onlineUsers(): User[] {
    const all = [...this.visible.values()]
    if (this.me) all.push(this.me)
    return all.sort((a, b) => a.joinedAt - b.joinedAt)
  }

  private startTimers(): void {
    this.stopTimers()
    this.heartbeatTimer = setInterval(() => this.beat(), HEARTBEAT_MS)
    this.reconcileTimer = setInterval(() => this.reconcile(), RECONCILE_MS)
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.reconcileTimer) clearInterval(this.reconcileTimer)
    this.heartbeatTimer = null
    this.reconcileTimer = null
  }

  /** 更新自己的心跳,讓別人知道我還在線上 */
  private beat(): void {
    if (!this.me || !this.channel || this.status !== 'connected') return
    void this.channel.track(this.toMeta(this.me))
  }

  /** 頁面要關閉了:盡力通知大家我離開(不等結果)。就算沒送到,對方也會因為心跳停止而把我移出名單。 */
  private leaveQuietly(): void {
    const channel = this.channel
    if (!channel || !this.me) return
    try {
      void channel.untrack()
      void this.db.removeChannel(channel)
    } catch {
      /* 頁面都要關了,失敗就算了 */
    }
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
    beat: Date.now(),
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
    this.visible.clear()
    this.stopTimers()
    this.typing.reset()
    if (!channel) return
    try {
      await channel.untrack()
      await this.db.removeChannel(channel)
    } catch {
      /* 已經斷線就算了,伺服器會自己判定離線 */
    }
  }
}
