import { formatTime, nickColorClass } from '../lib/nickColor'

interface Props {
  nickname: string
  time: string | number
  text: string
  self: boolean
  /** 只有自己的訊息會有 */
  state?: { status: 'sending' | 'failed'; reason?: string; onRetry: () => void }
}

/** 傳送失敗時顯示的說明:依原因給具體一點的提示 */
function failureText(reason?: string): string {
  switch (reason) {
    case 'rate_limited':
      return '送太快了,請稍後重送'
    case 'nickname_not_allowed':
      return '這個代號不允許發言,請換一個代號'
    case 'too_long':
      return '內容太長'
    default:
      return '傳送失敗'
  }
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
            {failureText(state.reason)}
            {state.reason !== 'nickname_not_allowed' && (
              <>
                {' '}
                <button type="button" onClick={state.onRetry}>
                  重送
                </button>
              </>
            )}
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
