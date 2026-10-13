import { useLayoutEffect, useRef, useState } from 'react'
import type { PendingMessage, TimelineItem } from '../hooks/useChat'
import { MessageItem } from './MessageItem'

interface Props {
  items: TimelineItem[]
  pending: PendingMessage[]
  meClientId: string
  meNickname: string
  onRetry: (localId: number, text: string) => void
}

/** 離底部多近算「在底部」 */
const BOTTOM_TOLERANCE = 40

export function MessageList({ items, pending, meClientId, meNickname, onRetry }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const wasAtBottom = useRef(true)
  const prevItems = useRef(0)
  const prevPending = useRef(0)
  const [showNew, setShowNew] = useState(false)

  const scrollToBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_TOLERANCE
    wasAtBottom.current = atBottom
    if (atBottom) setShowNew(false)
  }

  // 內容變動後決定怎麼捲動:
  //  - 自己送出的 → 一律捲到底
  //  - 停在底部 → 跟著捲到最新
  //  - 正在往上翻 → 不打斷,有新訊息就顯示「有新訊息」按鈕
  useLayoutEffect(() => {
    const added = items.slice(prevItems.current)
    const pendingAdded = pending.length > prevPending.current
    const first = prevItems.current === 0 && prevPending.current === 0
    prevItems.current = items.length
    prevPending.current = pending.length

    const mine = added.some((i) => i.kind === 'message' && i.message.clientId === meClientId)
    if (first || pendingAdded || mine || wasAtBottom.current) {
      scrollToBottom()
      wasAtBottom.current = true
    } else if (added.some((i) => i.kind === 'message')) {
      setShowNew(true)
    }
  }, [items, pending, meClientId])

  const jumpToLatest = () => {
    scrollToBottom()
    wasAtBottom.current = true
    setShowNew(false)
  }

  return (
    <div className="list-wrap">
      <div className="list" ref={listRef} onScroll={onScroll} role="log" aria-live="polite">
        {items.map((item) => {
          if (item.kind === 'notice') return <div key={item.key} className="sys">{item.text}</div>
          if (item.kind === 'gap') return <div key={item.key} className="gap">中間有部分訊息未顯示</div>
          const m = item.message
          return (
            <MessageItem
              key={item.key}
              nickname={m.nickname}
              time={m.sentAt}
              text={m.text}
              self={m.clientId === meClientId}
            />
          )
        })}
        {pending.map((p) => (
          <MessageItem
            key={`p${p.localId}`}
            nickname={meNickname}
            time={p.createdAt}
            text={p.text}
            self
            state={{ status: p.status, onRetry: () => onRetry(p.localId, p.text) }}
          />
        ))}
      </div>
      {showNew && (
        <button type="button" className="newmsg" onClick={jumpToLatest}>
          ▾ 有新訊息
        </button>
      )}
    </div>
  )
}
