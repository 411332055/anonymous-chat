import { useEffect, useRef } from 'react'

interface Props {
  onCancel: () => void
  onConfirm: () => void
}

/** 換代號確認視窗。Esc = 取消;Tab 鍵的焦點只在視窗裡轉。 */
export function ChangeNicknameDialog({ onCancel, onConfirm }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const confirmBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    confirmBtn.current?.focus()
    return () => previous?.focus()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
      return
    }
    if (e.key !== 'Tab') return
    const focusables = box.current?.querySelectorAll<HTMLElement>('button')
    if (!focusables || focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="scrim" onKeyDown={onKeyDown}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={box}>
        <h5 id="dlg-title">換代號?</h5>
        <p>換代號會先離開聊天室,其他人會看到你離開了。</p>
        <div className="acts">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={onConfirm} ref={confirmBtn}>
            確定
          </button>
        </div>
      </div>
    </div>
  )
}
