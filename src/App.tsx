import { useEffect, useState } from 'react'
import type { ChatInitial } from './hooks/useChat'
import { clearNickname, loadNickname, saveNickname } from './lib/storage'
import { NICKNAME_LENGTH_MESSAGE } from './lib/validate'
import { ChatScreen } from './screens/ChatScreen'
import { JoinScreen } from './screens/JoinScreen'
import { chatService } from './services'
import type { JoinResult } from './services/types'

type Stage =
  | { kind: 'boot' }
  | { kind: 'join'; notice?: string }
  | { kind: 'chat'; nickname: string; initial: ChatInitial }

const NETWORK_MESSAGE = '連不上聊天室,請檢查網路後再試一次。'

function failureMessage(reason: Extract<JoinResult, { ok: false }>['reason']): string {
  switch (reason) {
    case 'nickname_taken':
      return '這個代號有人用了,換一個試試。'
    case 'invalid':
      return NICKNAME_LENGTH_MESSAGE
    case 'network':
      return NETWORK_MESSAGE
  }
}

export default function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'boot' })

  // 開啟網頁時:有記住的代號就直接進去
  useEffect(() => {
    const saved = loadNickname()
    if (!saved) {
      setStage({ kind: 'join' })
      return
    }
    let cancelled = false
    void chatService.join(saved).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setStage({ kind: 'chat', nickname: saved, initial: { recent: r.recent, online: r.online } })
      } else if (r.reason === 'nickname_taken') {
        setStage({ kind: 'join', notice: `你上次的代號「${saved}」現在有人在用,請換一個。` })
      } else {
        if (r.reason === 'invalid') clearNickname()
        setStage({ kind: 'join', notice: r.reason === 'network' ? NETWORK_MESSAGE : '' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleJoin = async (nickname: string): Promise<string | null> => {
    const r = await chatService.join(nickname)
    if (!r.ok) return failureMessage(r.reason)
    saveNickname(nickname)
    setStage({ kind: 'chat', nickname, initial: { recent: r.recent, online: r.online } })
    return null
  }

  const handleLeave = async () => {
    await chatService.leave()
    clearNickname()
    setStage({ kind: 'join' })
  }

  if (stage.kind === 'boot') return <div className="boot" aria-busy="true" />
  if (stage.kind === 'join') {
    return <JoinScreen service={chatService} initialError={stage.notice} onJoin={handleJoin} />
  }
  return (
    <ChatScreen
      service={chatService}
      nickname={stage.nickname}
      initial={stage.initial}
      onLeave={handleLeave}
    />
  )
}
