import { useEffect, useRef, useState } from 'react'
import type { TimelineItem } from './useChat'

const BASE_TITLE = '匿名聊天室'

/** 分頁在背景時,別人的新訊息會累計成未讀數,顯示在瀏覽器分頁標題:「(3) 匿名聊天室」。
 *  回到這個分頁(或視窗重新取得焦點)就歸零。只影響自己的畫面,不會傳給任何人。 */
export function useUnreadTitle(items: TimelineItem[], meClientId: string): void {
  const [unread, setUnread] = useState(0)
  const seen = useRef(items.length)

  // 有新訊息:分頁不在前景、而且是別人發的,就累計
  useEffect(() => {
    const added = items.slice(seen.current)
    seen.current = items.length
    if (!document.hidden) return
    const fromOthers = added.filter((i) => i.kind === 'message' && i.message.clientId !== meClientId).length
    if (fromOthers > 0) setUnread((n) => n + fromOthers)
  }, [items, meClientId])

  // 回到這個分頁就歸零
  useEffect(() => {
    const reset = () => {
      if (!document.hidden) setUnread(0)
    }
    document.addEventListener('visibilitychange', reset)
    window.addEventListener('focus', reset)
    return () => {
      document.removeEventListener('visibilitychange', reset)
      window.removeEventListener('focus', reset)
    }
  }, [])

  useEffect(() => {
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${BASE_TITLE}` : BASE_TITLE
  }, [unread])

  // 離開聊天室畫面時還原標題
  useEffect(() => () => void (document.title = BASE_TITLE), [])
}
