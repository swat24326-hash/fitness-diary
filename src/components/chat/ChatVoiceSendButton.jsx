import { useEffect, useRef, useState } from 'react'
import { BellOff, Loader2, Send } from 'lucide-react'

const HOLD_MS = 500

/**
 * «Отправить» голосовое; подержать (или правая кнопка мыши) — «Отправить без звука», как в Telegram:
 * у собеседника уведомление придёт тихо.
 * @param {{ sending: boolean, onSend: (opts?: { silent?: boolean }) => void, label?: string }} props
 */
export function ChatVoiceSendButton({ sending, onSend, label = 'Отправить голосовое' }) {
  const [menu, setMenu] = useState(false)
  const timerRef = useRef(0)
  const heldRef = useRef(false)
  const touchRef = useRef(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!menu) return undefined
    const close = (e) => {
      if (!boxRef.current?.contains(e.target)) setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  /** Палец держали — click после отпускания не отправляет; правая кнопка мыши click не шлёт — флаг не ставим. */
  const open = (held) => {
    if (held) heldRef.current = true
    navigator.vibrate?.(10)
    setMenu(true)
  }

  return (
    <span className="chat-voice-send" ref={boxRef}>
      {menu ? (
        <span className="chat-voice-send__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            data-testid="chat-voice-send-silent"
            onClick={() => {
              setMenu(false)
              onSend({ silent: true })
            }}
          >
            <BellOff size={16} aria-hidden />
            Отправить без звука
          </button>
        </span>
      ) : null}
      {/* Другой key, чем у 🎤: click того же нажатия, что перевело в «без рук», не должен сразу отправить. */}
      <button
        key="send"
        type="button"
        className="chat-compose__send is-ready"
        aria-label={label}
        title="Отправить (подержите — без звука)"
        aria-haspopup="menu"
        disabled={sending}
        data-testid="chat-voice-send"
        onPointerDown={(e) => {
          touchRef.current = e.pointerType !== 'mouse'
          if (!touchRef.current) return
          heldRef.current = false
          timerRef.current = window.setTimeout(() => open(true), HOLD_MS)
        }}
        onPointerUp={() => window.clearTimeout(timerRef.current)}
        onPointerCancel={() => window.clearTimeout(timerRef.current)}
        onContextMenu={(e) => {
          e.preventDefault()
          if (!menu) open(touchRef.current)
        }}
        onClick={() => {
          if (heldRef.current) {
            heldRef.current = false
            return
          }
          onSend()
        }}
      >
        {sending ? <Loader2 size={20} className="chat-voice__spin" aria-hidden /> : <Send size={20} aria-hidden />}
      </button>
    </span>
  )
}
