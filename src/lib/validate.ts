import { hasProfanity } from './profanity'

export const NICKNAME_MAX = 24
export const MESSAGE_MAX = 200
export const MESSAGE_MAX_LINES = 10
/** 字數達到這個數字才顯示計數,避免平常畫面太吵 */
export const MESSAGE_WARN_AT = 180

// 控制字元、不可見字元、反向文字記號等(會讓畫面錯亂,或讓人假冒別人的代號)
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/gu

/** 以「字」計算(一個表情符號算一個字) */
export const charCount = (s: string) => Array.from(s).length

export function normalizeNickname(raw: string): string {
  return raw.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()
}

export const NICKNAME_LENGTH_MESSAGE = '代號要 1 到 24 個字,不能只有空白。'
export const NICKNAME_PROFANITY_MESSAGE = '這個代號含有不允許的字詞,請換一個。'

export type NicknameCheck = { ok: true; value: string } | { ok: false; message: string }

export function checkNickname(raw: string): NicknameCheck {
  const value = normalizeNickname(raw)
  const n = charCount(value)
  if (n < 1 || n > NICKNAME_MAX) return { ok: false, message: NICKNAME_LENGTH_MESSAGE }
  if (hasProfanity(value)) return { ok: false, message: NICKNAME_PROFANITY_MESSAGE }
  return { ok: true, value }
}

/** 清理訊息:統一換行、去掉不可見字元(保留換行與表情符號用的連接字元)、壓縮過多的空行、去頭尾空白 */
export function normalizeMessage(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, (ch) => (ch === '‍' ? ch : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type MessageCheck =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'too_many_lines' }

/** 檢查訊息能不能送出(髒話過濾是另一步,在送出前才做) */
export function checkMessage(raw: string): MessageCheck {
  const value = normalizeMessage(raw)
  if (value.length === 0) return { ok: false, reason: 'empty' }
  if (charCount(value) > MESSAGE_MAX) return { ok: false, reason: 'too_long' }
  if (value.split('\n').length > MESSAGE_MAX_LINES) return { ok: false, reason: 'too_many_lines' }
  return { ok: true, value }
}
