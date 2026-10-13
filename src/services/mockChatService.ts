import { randomId, getTabClientId } from '../lib/clientId'
import { filterProfanity } from '../lib/profanity'
import { charCount, MESSAGE_MAX } from '../lib/validate'
import { BOT_LINES, BOT_NAMES, BOTS_ONLINE_AT_START, SEED_CONVERSATION } from './mockBots'
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

// 階段一的假資料來源:遵守 ChatService 介面,但不連任何伺服器。
//  - 機器人會定時說話、進出
//  - 同一個瀏覽器的不同分頁,透過 BroadcastChannel 互相聊天、互相看得到在線
//  - 刻意加上一點延遲,讓「傳送中」「連線中」這些畫面看得到

const CHANNEL_NAME = 'anonymous-chat-mock'
const HISTORY_LIMIT = 200
/** 斷線太久時,最多只補回這麼多則 */
const BACKFILL_LIMIT = 50
const RECONNECT_AFTER_MS = 8000

type Packet =
  | { t: 'who' }
  | { t: 'here'; user: User }
  | { t: 'hello'; user: User }
  | { t: 'bye'; clientId: string }
  | { t: 'msg'; message: Message }
  | { t: 'typing'; user: User }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export class MockChatService implements ChatService {
  readonly isDemo = true
  // 示範模式用「每個分頁各一個」的 clientId,這樣同一個瀏覽器開兩個分頁才像兩個人
  readonly clientId = getTabClientId()

  private listeners = new Map<string, Set<(payload: never) => void>>()
  private channel: BroadcastChannel | null = null

  private me: User | null = null
  private history: Message[] = []
  private bots = new Map<string, User>()
  private peers = new Map<string, User>()

  private offline = false
  private queue: Array<{ event: keyof ChatEvents; payload: unknown }> = []
  private timers = new Set<ReturnType<typeof setTimeout>>()

  // 「正在輸入」:別人(其他分頁、機器人)的訊號,一段時間沒更新就自動消失
  private typing = new TypingTracker((users) => this.emit('typing:update', users))
  private lastTypingSent = 0

  constructor() {
    this.seed()
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (e: MessageEvent<Packet>) => this.onPacket(e.data)
    }
    // 關掉分頁時通知其他分頁「我走了」
    window.addEventListener('pagehide', () => {
      if (this.me) this.post({ t: 'bye', clientId: this.clientId })
    })
  }

  readonly simulate = {
    disconnect: () => {
      if (this.offline || !this.me) return
      this.offline = true
      this.emit('connection:status', 'reconnecting')
      this.later(RECONNECT_AFTER_MS, () => this.reconnect())
    },
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
    await sleep(250)
    // 先問問其他分頁有誰在線,再判斷代號能不能用
    this.peers.clear()
    this.post({ t: 'who' })
    await sleep(150)

    const lower = nickname.toLowerCase()
    const taken =
      [...this.bots.values()].some((b) => b.nickname.toLowerCase() === lower) ||
      [...this.peers.values()].some(
        (p) => p.clientId !== this.clientId && p.nickname.toLowerCase() === lower,
      )
    if (taken) return { ok: false, reason: 'nickname_taken' }

    this.me = { nickname, clientId: this.clientId, joinedAt: Date.now() }
    this.offline = false
    this.queue = []
    this.post({ t: 'hello', user: this.me })
    this.startBots()
    return { ok: true, recent: this.history.slice(-BACKFILL_LIMIT), online: this.onlineUsers() }
  }

  async send(text: string): Promise<SendResult> {
    await sleep(150)
    if (!this.me || this.offline) return { ok: false, reason: 'network' }
    if (text.trim().length === 0) return { ok: false, reason: 'empty' }
    if (charCount(text) > MESSAGE_MAX) return { ok: false, reason: 'too_long' }

    const message: Message = {
      id: randomId(),
      nickname: this.me.nickname,
      clientId: this.clientId,
      text,
      sentAt: new Date().toISOString(),
    }
    this.addToHistory(message)
    this.post({ t: 'msg', message })
    this.emit('message:new', message)
    return { ok: true }
  }

  /** 使用者正在打字:通知其他分頁(最多每 1.5 秒一次) */
  notifyTyping(): void {
    if (!this.me || this.offline) return
    const now = Date.now()
    if (now - this.lastTypingSent < 1500) return
    this.lastTypingSent = now
    this.post({ t: 'typing', user: this.me })
  }

  async leave(): Promise<void> {
    this.typing.reset()
    if (this.me) this.post({ t: 'bye', clientId: this.clientId })
    this.me = null
    this.offline = false
    this.queue = []
    this.peers.clear()
    this.stopBots()
  }

  /* ---------------- 事件:離線時先排隊,連上後一起補送 ---------------- */

  private emit<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    if (event === 'typing:update' && this.offline) return // 斷線時不排隊,連上後就過期了
    const isStatus = event === 'connection:status'
    if (this.offline && !isStatus) {
      this.queue.push({ event, payload })
      return
    }
    this.listeners.get(event)?.forEach((h) => (h as (p: ChatEvents[K]) => void)(payload))
  }

  private reconnect(): void {
    if (!this.offline) return
    this.offline = false
    const queued = this.queue
    this.queue = []

    // 斷線太久就只補最近的幾則,並提示中間有缺漏
    const messages = queued.filter((q) => q.event === 'message:new')
    const dropped = messages.length - BACKFILL_LIMIT
    if (dropped > 0) {
      const drop = new Set(messages.slice(0, dropped))
      this.emit('messages:gap', undefined)
      for (const q of queued) if (!drop.has(q)) this.emitRaw(q.event, q.payload)
    } else {
      for (const q of queued) this.emitRaw(q.event, q.payload)
    }
    this.emit('presence:sync', this.onlineUsers())
    this.emit('connection:status', 'connected' satisfies ConnectionStatus)
  }

  private emitRaw(event: keyof ChatEvents, payload: unknown): void {
    this.listeners.get(event)?.forEach((h) => (h as (p: unknown) => void)(payload))
  }

  /* ---------------- 其他分頁 ---------------- */

  private post(packet: Packet): void {
    this.channel?.postMessage(packet)
  }

  private onPacket(p: Packet): void {
    // 「複製分頁」會連 sessionStorage 一起複製,兩個分頁就會有同一個 clientId。
    // 來自「同一個 clientId」的封包一律當作自己,不處理,避免名單出現兩個「你」。
    const from =
      p.t === 'here' || p.t === 'hello' ? p.user.clientId
      : p.t === 'bye' ? p.clientId
      : p.t === 'msg' ? p.message.clientId
      : p.t === 'typing' ? p.user.clientId
      : null
    if (from === this.clientId) return

    switch (p.t) {
      case 'who':
        if (this.me) this.post({ t: 'here', user: this.me })
        break
      case 'here':
        this.peers.set(p.user.clientId, p.user)
        break
      case 'hello':
        this.peers.set(p.user.clientId, p.user)
        if (this.me) {
          this.emit('user:joined', p.user)
          this.emit('presence:sync', this.onlineUsers())
        }
        break
      case 'typing':
        if (this.me) this.typing.touch(p.user)
        break
      case 'bye': {
        this.typing.clear(p.clientId)
        const user = this.peers.get(p.clientId)
        if (!user) break
        this.peers.delete(p.clientId)
        if (this.me) {
          this.emit('user:left', user)
          this.emit('presence:sync', this.onlineUsers())
        }
        break
      }
      case 'msg':
        this.typing.clear(p.message.clientId)
        if (this.me) {
          this.addToHistory(p.message)
          this.emit('message:new', p.message)
        }
        break
    }
  }

  /* ---------------- 機器人 ---------------- */

  private seed(): void {
    const now = Date.now()
    for (const s of SEED_CONVERSATION) {
      this.history.push({
        id: randomId(),
        nickname: s.bot,
        clientId: `bot:${s.bot}`,
        text: filterProfanity(s.text),
        sentAt: new Date(now - s.minutesAgo * 60_000).toISOString(),
      })
    }
    for (const name of BOTS_ONLINE_AT_START) this.bots.set(name, this.botUser(name))
  }

  private botUser(name: string): User {
    return { nickname: name, clientId: `bot:${name}`, joinedAt: Date.now() }
  }

  private startBots(): void {
    this.stopBots()
    this.scheduleChat()
    this.scheduleChurn()
  }

  private stopBots(): void {
    this.timers.forEach(clearTimeout)
    this.timers.clear()
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timers.delete(id)
      fn()
    }, ms)
    this.timers.add(id)
  }

  private lastLine = ''

  private scheduleChat(): void {
    this.later(rand(5000, 14000), () => {
      const speakers = [...this.bots.values()]
      if (speakers.length > 0) {
        const bot = pick(speakers)
        let line = pick(BOT_LINES)
        if (line === this.lastLine) line = pick(BOT_LINES)
        this.lastLine = line
        // 先顯示一下「正在輸入…」,再送出訊息(示範用,讓你看得到這個功能)
        this.typing.touch(bot, 2500)
        this.later(1400, () => {
          if (!this.bots.has(bot.nickname)) return this.typing.clear(bot.clientId)
          const message: Message = {
            id: randomId(),
            nickname: bot.nickname,
            clientId: bot.clientId,
            text: filterProfanity(line),
            sentAt: new Date().toISOString(),
          }
          this.addToHistory(message)
          this.typing.clear(bot.clientId)
          this.emit('message:new', message)
        })
      }
      this.scheduleChat()
    })
  }

  private scheduleChurn(): void {
    this.later(rand(18000, 38000), () => {
      const online = [...this.bots.values()]
      const usedNames = new Set(
        [this.me?.nickname, ...[...this.peers.values()].map((p) => p.nickname)]
          .filter((n): n is string => !!n)
          .map((n) => n.toLowerCase()),
      )
      const away = BOT_NAMES.filter(
        (n) => !this.bots.has(n) && !usedNames.has(n.toLowerCase()),
      )
      const shouldLeave = online.length > 3 || (online.length > 1 && (away.length === 0 || Math.random() < 0.5))
      if (shouldLeave) {
        const bot = pick(online)
        this.bots.delete(bot.nickname)
        this.emit('user:left', bot)
      } else if (away.length > 0) {
        const bot = this.botUser(pick(away))
        this.bots.set(bot.nickname, bot)
        this.emit('user:joined', bot)
      }
      this.emit('presence:sync', this.onlineUsers())
      this.scheduleChurn()
    })
  }

  /* ---------------- 其他 ---------------- */

  private addToHistory(m: Message): void {
    this.history.push(m)
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT)
  }

  private onlineUsers(): User[] {
    const all = [...this.bots.values(), ...this.peers.values()]
    if (this.me) all.push(this.me)
    return all.sort((a, b) => a.joinedAt - b.joinedAt)
  }
}
