import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatService, ConnectionStatus, Message, User } from '../services/types'

/** 訊息串裡的一項:訊息、進出提示、或「中間有缺漏」 */
export type TimelineItem =
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'notice'; key: string; text: string }
  | { kind: 'gap'; key: string }

/** 自己剛送出、還沒收到確認的訊息 */
export interface PendingMessage {
  localId: number
  text: string
  status: 'sending' | 'failed'
  createdAt: number
}

export interface ChatInitial {
  recent: Message[]
  online: User[]
}

/** 送出成功後,如果一直沒收到對應的訊息事件,就在這個時間後把「傳送中」拿掉 */
const PENDING_TIMEOUT_MS = 4000

export function useChat(service: ChatService, initial: ChatInitial) {
  const clientId = service.clientId
  const [items, setItems] = useState<TimelineItem[]>(() =>
    initial.recent.map((m) => ({ kind: 'message', key: m.id, message: m })),
  )
  const [online, setOnline] = useState<User[]>(initial.online)
  const [status, setStatus] = useState<ConnectionStatus>('connected')
  const [pending, setPending] = useState<PendingMessage[]>([])

  const seen = useRef(new Set(initial.recent.map((m) => m.id)))
  const counter = useRef(0)

  useEffect(() => {
    const push = (item: TimelineItem) => setItems((prev) => [...prev, item])
    const offs = [
      service.on('message:new', (m) => {
        if (seen.current.has(m.id)) return // 重連補訊息時避免重複
        seen.current.add(m.id)
        push({ kind: 'message', key: m.id, message: m })
        if (m.clientId === clientId) {
          // 自己的訊息收到確認了:拿掉對應的「傳送中」
          setPending((prev) => {
            const i = prev.findIndex((p) => p.text === m.text)
            return i < 0 ? prev : prev.filter((_, j) => j !== i)
          })
        }
      }),
      service.on('presence:sync', (users) => setOnline(users)),
      service.on('user:joined', (u) => {
        if (u.clientId !== clientId) push({ kind: 'notice', key: `n${counter.current++}`, text: `${u.nickname} 進來了` })
      }),
      service.on('user:left', (u) => {
        if (u.clientId !== clientId) push({ kind: 'notice', key: `n${counter.current++}`, text: `${u.nickname} 離開了` })
      }),
      service.on('connection:status', (s) => setStatus(s)),
      service.on('messages:gap', () => push({ kind: 'gap', key: `g${counter.current++}` })),
    ]
    return () => offs.forEach((off) => off())
  }, [service, clientId])

  const attempt = useCallback(
    async (localId: number, text: string) => {
      const result = await service.send(text)
      if (!result.ok) {
        setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'failed' } : p)))
        return
      }
      setTimeout(() => setPending((prev) => prev.filter((p) => p.localId !== localId)), PENDING_TIMEOUT_MS)
    },
    [service],
  )

  const send = useCallback(
    (text: string) => {
      const localId = counter.current++
      setPending((prev) => [...prev, { localId, text, status: 'sending', createdAt: Date.now() }])
      void attempt(localId, text)
    },
    [attempt],
  )

  const retry = useCallback(
    (localId: number, text: string) => {
      setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: 'sending' } : p)))
      void attempt(localId, text)
    },
    [attempt],
  )

  return { items, online, status, pending, send, retry, clientId }
}
