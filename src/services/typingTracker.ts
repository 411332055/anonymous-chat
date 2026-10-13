import type { User } from './types'

/** 記錄「誰正在輸入」。每個人一段時間沒再發出訊號,就自動當作停止輸入。
 *  示範模式與 Supabase 兩個資料來源共用。 */
export class TypingTracker {
  private entries = new Map<string, { user: User; timer: ReturnType<typeof setTimeout> }>()

  constructor(
    private onChange: (users: User[]) => void,
    private defaultTtlMs = 3500,
  ) {}

  /** 收到「某人正在輸入」的訊號 */
  touch(user: User, ttlMs = this.defaultTtlMs): void {
    const existing = this.entries.get(user.clientId)
    if (existing) clearTimeout(existing.timer)
    const timer = setTimeout(() => this.clear(user.clientId), ttlMs)
    this.entries.set(user.clientId, { user, timer })
    if (!existing) this.emit()
  }

  /** 某人送出訊息、離開、或超時,就不再顯示他正在輸入 */
  clear(clientId: string): void {
    const existing = this.entries.get(clientId)
    if (!existing) return
    clearTimeout(existing.timer)
    this.entries.delete(clientId)
    this.emit()
  }

  reset(): void {
    if (this.entries.size === 0) return
    for (const e of this.entries.values()) clearTimeout(e.timer)
    this.entries.clear()
    this.emit()
  }

  private emit(): void {
    this.onChange([...this.entries.values()].map((e) => e.user))
  }
}
