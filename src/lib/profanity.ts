import { BAD_WORDS } from './badWords'

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isAscii = (s: string) => !/[^\x00-\x7f]/.test(s)

const cjk = BAD_WORDS.filter((w) => !isAscii(w)).sort((a, b) => b.length - a.length)
const ascii = BAD_WORDS.filter(isAscii)

const parts: string[] = []
if (cjk.length) parts.push(cjk.map(escapeRegex).join('|'))
if (ascii.length) parts.push(`\\b(?:${ascii.map(escapeRegex).join('|')})\\w*`)
const source = parts.join('|')

// 兩個正規表達式:一個用來取代(全域),一個只用來判斷(避免全域旗標的狀態問題)
const replacer = new RegExp(source, 'giu')
const detector = new RegExp(source, 'iu')

/** 把髒話換成同長度的星號 */
export function filterProfanity(text: string): string {
  return text.replace(replacer, (m) => '*'.repeat(Array.from(m).length))
}

export function hasProfanity(text: string): boolean {
  return detector.test(text)
}
