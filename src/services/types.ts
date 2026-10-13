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
  | { ok: false; reason: 'too_long' | 'empty' | 'network' }

/** 資料來源發出的事件,以及各自帶的資料 */
export interface ChatEvents {
  'message:new': Message
  'presence:sync': User[]
  'user:joined': User
  'user:left': User
  'connection:status': ConnectionStatus
  /** 斷線太久、中間有訊息沒補回來 */
  'messages:gap': void
}

export interface ChatService {
  /** 示範模式(假資料)時為 true,畫面會顯示示範橫幅 */
  readonly isDemo: boolean
  readonly clientId: string

  join(nickname: string): Promise<JoinResult>
  loadRecent(limit: number): Promise<Message[]>
  send(text: string): Promise<SendResult>
  leave(): Promise<void>
  /** 訂閱事件,回傳取消訂閱的函式 */
  on<K extends keyof ChatEvents>(
    event: K,
    handler: (payload: ChatEvents[K]) => void,
  ): () => void

  /** 只有示範模式才有:模擬斷線,方便測試重連畫面 */
  readonly simulate?: { disconnect(): void }
}
