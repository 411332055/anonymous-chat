import { formatTime, nickColorClass } from '../lib/nickColor'

interface Props {
  nickname: string
  time: string | number
  text: string
  self: boolean
  /** 只有自己的訊息會有 */
  state?: { status: 'sending' | 'failed'; onRetry: () => void }
}

export function MessageItem({ nickname, time, text, self, state }: Props) {
  if (self) {
    return (
      <div className={`msg self${state?.status === 'failed' ? ' failed' : ''}`}>
        <div className="meta">
          <b>{nickname}</b>
          <time>{formatTime(time)}</time>
        </div>
        <p className="txt">{text}</p>
        {state?.status === 'sending' && <div className="state">傳送中…</div>}
        {state?.status === 'failed' && (
          <div className="state">
            傳送失敗{' '}
            <button type="button" onClick={state.onRetry}>
              重送
            </button>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className={`msg other ${nickColorClass(nickname)}`}>
      <div className="meta">
        <b className="nick">{nickname}</b>
        <time>{formatTime(time)}</time>
      </div>
      {/* 內容永遠當純文字顯示:連結不可點,也不會被當成網頁碼執行 */}
      <p className="txt">{text}</p>
    </div>
  )
}
