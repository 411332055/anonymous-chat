// 記住代號(存在瀏覽器的 localStorage,關掉網頁也不會消失)。
// 隱私模式等情況下 localStorage 可能無法使用,所以全部包 try/catch,失敗就當作沒記住。
const KEY = 'anonymous-chat:nickname'

export function loadNickname(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(KEY, nickname)
  } catch {
    /* 記不住就算了 */
  }
}

export function clearNickname(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 同上 */
  }
}
