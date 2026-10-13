import { nickColorClass } from '../lib/nickColor'
import type { User } from '../services/types'

interface Props {
  id: string
  users: User[]
  meClientId: string
}

export function OnlineList({ id, users, meClientId }: Props) {
  // 自己排最前面,其他人維持進入順序
  const me = users.filter((u) => u.clientId === meClientId)
  const others = users.filter((u) => u.clientId !== meClientId)
  return (
    <aside className="side" id={id} aria-label="在線名單">
      <h4>在線 {users.length} 人</h4>
      <ul>
        {[...me, ...others].map((u) =>
          u.clientId === meClientId ? (
            <li key={u.clientId} className="me">
              {u.nickname} <span className="you">(你)</span>
            </li>
          ) : (
            <li key={u.clientId} className={nickColorClass(u.nickname)}>
              {u.nickname}
            </li>
          ),
        )}
      </ul>
    </aside>
  )
}
