// 通訊約定(docs/architecture.md 第 5 節)。
// 畫面層只准認識這個檔案裡的東西;假資料來源與 Supabase 資料來源都要遵守它。

export interface User {
  nickname: string
  /** 這個瀏覽器(或分頁)的隨機識別碼,用來判斷「這是不是我」。不是密碼。 */
  clientId: string
  joinedAt: number
}

export interface Message {
  id: string
  nickname: string
  clientId: string
  /** 已過濾、已檢查長度的內容 */
  text: string
  /** ISO 時間字串,由資料來源蓋章 */
  sentAt: string
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting'

export type JoinResult =
  | { ok: true; recent: Message[]; online: User[] }
  | { ok: false; reason: 'nickname_taken' | 'invalid' | 'network' }

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'too_long' | 'empty' | 'rate_limited' | 'nickname_not_allowed' | 'network' }

/** 資料來源發出的事件,以及各自帶的資料 */
export interface ChatEvents {
  'message:new': Message
  'presence:sync': User[]
  'user:joined': User
  'user:left': User
  'connection:status': ConnectionStatus
  /** 斷線太久、中間有訊息沒補回來 */
  'messages:gap': void
  /** 目前有哪些「別人」正在輸入(不含自己)。每次有人開始或停止輸入就會重新發一次完整名單 */
  'typing:update': User[]
}

export interface ChatService {
  /** 示範模式(假資料)時為 true,畫面會顯示示範橫幅 */
  readonly isDemo: boolean
  readonly clientId: string

  /** 進入聊天室。成功時一併回傳最近的訊息與目前在線名單 */
  join(nickname: string): Promise<JoinResult>
  send(text: string): Promise<SendResult>
  /** 告訴其他人「我正在輸入」。畫面在使用者打字時呼叫,資料來源自己負責節流 */
  notifyTyping(): void
  leave(): Promise<void>
  /** 訂閱事件,回傳取消訂閱的函式 */
  on<K extends keyof ChatEvents>(
    event: K,
    handler: (payload: ChatEvents[K]) => void,
  ): () => void

  /** 只有示範模式才有:模擬斷線,方便測試重連畫面 */
  readonly simulate?: { disconnect(): void }
}
