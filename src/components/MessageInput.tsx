import { useEffect, useRef, useState } from 'react'
import { filterProfanity } from '../lib/profanity'
import { charCount, checkMessage, MESSAGE_MAX, MESSAGE_MAX_LINES, MESSAGE_WARN_AT } from '../lib/validate'

interface Props {
  /** 沒連線時為 true:仍可打字,但不能送出 */
  disconnected: boolean
  onSend: (text: string) => void
}

/** 同一個人至少隔多久才能再送一則 */
const MIN_INTERVAL_MS = 1000
const MAX_TEXTAREA_HEIGHT = 132

export function MessageInput({ disconnected, onSend }: Props) {
  const [value, setValue] = useState('')
  const [slowDown, setSlowDown] = useState(false)
  const lastSent = useRef(0)
  const area = useRef<HTMLTextAreaElement>(null)

  // 輸入框隨內容長高(有上限)
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [value])

  const check = checkMessage(value)
  const count = charCount(value.trim())
  const tooManyLines = !check.ok && check.reason === 'too_many_lines'
  const canSend = check.ok && !disconnected

  const submit = () => {
    if (!check.ok || disconnected) return
    if (Date.now() - lastSent.current < MIN_INTERVAL_MS) {
      setSlowDown(true)
      setTimeout(() => setSlowDown(false), 1800)
      return
    }
    lastSent.current = Date.now()
    onSend(filterProfanity(check.value))
    setValue('')
    area.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    // 手機(觸控)的 Enter 是換行,用按鈕送出;電腦的 Enter 送出
    if (window.matchMedia('(pointer: coarse)').matches) return
    e.preventDefault()
    submit()
  }

  let hint: string | null = null
  if (disconnected) hint = '連線後才能送出'
  else if (slowDown) hint = '請稍等一下再送出'
  else if (tooManyLines) hint = `最多 ${MESSAGE_MAX_LINES} 行`

  return (
    <div className="composer">
      <div className="box">
        <div className="field">
          <span className="caret" aria-hidden="true">&gt;</span>
          <textarea
            ref={area}
            rows={1}
            aria-label="訊息"
            placeholder={disconnected ? '連線後才能送出' : '輸入訊息'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <button type="button" className="btn primary" disabled={!canSend} onClick={submit}>
          送出
        </button>
      </div>
      <div className="foot">
        {hint ? <span>{hint}</span> : <span className="hint-d">Enter 送出,Shift+Enter 換行</span>}
        {count >= MESSAGE_WARN_AT && <span className="over">{count}/{MESSAGE_MAX}</span>}
      </div>
    </div>
  )
}
