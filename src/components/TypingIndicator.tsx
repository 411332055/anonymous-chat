import type { User } from '../services/types'

/** 輸入框上方的「○○ 正在輸入…」。沒有人輸入時是空的,但仍保留一行高度,避免畫面跳動。 */
export function TypingIndicator({ users }: { users: User[] }) {
  let text = ''
  if (users.length === 1) text = `${users[0].nickname} 正在輸入`
  else if (users.length === 2) text = `${users[0].nickname}、${users[1].nickname} 正在輸入`
  else if (users.length > 2) text = `${users.length} 個人正在輸入`

  return (
    <div className="typing" role="status" aria-live="polite">
      {text && (
        <>
          {text}
          <span className="dots" aria-hidden="true" />
        </>
      )}
    </div>
  )
}
