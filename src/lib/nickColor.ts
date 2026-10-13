// 其他人的代號顏色(5 種,見 docs/design.md 第 2 節)。
// 訊息串和在線名單都必須用這個函式,同一個人兩邊顏色才會一致。
export const NICK_COLOR_COUNT = 5

/** 由代號算出固定的顏色編號 1–5,對應樣式裡的 .nick-c1 到 .nick-c5 */
export function nickColorClass(nickname: string): string {
  let h = 0
  for (const ch of nickname) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return `nick-c${(h % NICK_COLOR_COUNT) + 1}`
}

/** 24 小時制「時:分」,使用者本地時間 */
export function formatTime(iso: string | number): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
