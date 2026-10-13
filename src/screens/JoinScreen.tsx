import { useState } from 'react'
import { DemoBanner } from '../components/DemoBanner'
import type { ChatService } from '../services/types'
import { charCount, checkNickname, NICKNAME_MAX, NICKNAME_LENGTH_MESSAGE } from '../lib/validate'

interface Props {
  service: ChatService
  /** 進入畫面時就要顯示的提示(例如「你上次的代號現在有人在用」) */
  initialError?: string
  /** 回傳錯誤訊息;成功時回傳 null(畫面會被換掉) */
  onJoin: (nickname: string) => Promise<string | null>
}

export function JoinScreen({ service, initialError = '', onJoin }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)

  const n = charCount(value.trim())
  const tooLong = n > NICKNAME_MAX
  const canSubmit = n >= 1 && !tooLong && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const check = checkNickname(value)
    if (!check.ok) {
      setError(check.message)
      return
    }
    setBusy(true)
    setError('')
    const message = await onJoin(check.value)
    if (message) {
      setError(message)
      setBusy(false)
    }
  }

  return (
    <div className="join">
      <DemoBanner service={service} />
      <form className="join-main" onSubmit={submit}>
        <h1>匿名聊天室</h1>
        <p className="sub">不用註冊。取個代號就能進來,所有人在同一間。</p>
        <label htmlFor="nickname">代號</label>
        <div className="prompt">
          <span className="caret blink" aria-hidden="true">&gt;</span>
          <input
            id="nickname"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="1 到 12 個字"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            aria-describedby="nickname-error"
            aria-invalid={error !== '' || tooLong}
          />
          <span className={`count${tooLong ? ' bad' : ''}`}>
            {n}/{NICKNAME_MAX}
          </span>
        </div>
        <div className="err" id="nickname-error" role="alert">
          {error || (tooLong ? NICKNAME_LENGTH_MESSAGE : '')}
        </div>
        <div>
          <button type="submit" className="btn primary" disabled={!canSubmit}>
            {busy ? '進入中…' : '進入聊天室'}
          </button>
        </div>
      </form>
    </div>
  )
}
