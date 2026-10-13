import { useEffect, useState } from 'react'
import { ChangeNicknameDialog } from '../components/ChangeNicknameDialog'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { DemoBanner } from '../components/DemoBanner'
import { MessageInput } from '../components/MessageInput'
import { MessageList } from '../components/MessageList'
import { OnlineList } from '../components/OnlineList'
import { useChat, type ChatInitial } from '../hooks/useChat'
import type { ChatService } from '../services/types'

const ROOM_NAME = '#大廳'

interface Props {
  service: ChatService
  nickname: string
  initial: ChatInitial
  onLeave: () => void
}

export function ChatScreen({ service, nickname, initial, onLeave }: Props) {
  const chat = useChat(service, initial)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // 手機的在線名單:按 Esc 也能關
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const disconnected = chat.status !== 'connected'

  return (
    <div className={`chat${drawerOpen ? ' drawer-open' : ''}`}>
      <DemoBanner service={service} offline={disconnected} />

      <header className="topbar">
        <span className="room">{ROOM_NAME}</span>
        <span className="online-n">在線 {chat.online.length} 人</span>
        <span className="spacer" />
        <button
          type="button"
          className="btn online-toggle"
          aria-expanded={drawerOpen}
          aria-controls="online-panel"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          在線 {chat.online.length} 人
        </button>
        <div className="me">
          <span>
            你是 <b>{nickname}</b>
          </span>
          <button type="button" className="btn change" onClick={() => setConfirming(true)}>
            換代號
          </button>
        </div>
      </header>

      {chat.status === 'reconnecting' && <ConnectionBanner />}

      <div className="body">
        <section className="stream">
          <MessageList
            items={chat.items}
            pending={chat.pending}
            meClientId={chat.clientId}
            meNickname={nickname}
            onRetry={chat.retry}
          />
          <MessageInput disconnected={disconnected} onSend={chat.send} />
        </section>
        <OnlineList id="online-panel" users={chat.online} meClientId={chat.clientId} />
      </div>

      {drawerOpen && <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />}

      {confirming && (
        <ChangeNicknameDialog onCancel={() => setConfirming(false)} onConfirm={onLeave} />
      )}
    </div>
  )
}
