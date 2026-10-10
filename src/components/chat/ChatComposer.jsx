import { useEffect, useRef, useState } from 'react'
import { Keyboard, Send, Smile } from 'lucide-react'
import { CHAT_BODY_MAX } from '../../lib/chat/chatMessageCore.js'
import { insertEmoji } from '../../lib/chat/chatEmojiCore.js'
import { ChatEmojiPicker } from './ChatEmojiPicker.jsx'

/** На компьютере Enter отправляет (Shift+Enter — перенос), на тач-экране Enter — перенос, как в Telegram. */
function enterSends() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
}

/**
 * Поле ввода переписки: капсула со смайликами и стикерами, круглая кнопка «Отправить».
 * @param {{ onSubmit: (input: string | { sticker: string }) => Promise<boolean>, sending: boolean, sendError: string, placeholder: string }} props
 */
export function ChatComposer({ onSubmit, sending, sendError, placeholder }) {
  const [draft, setDraft] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const inputRef = useRef(null)
  const caretRef = useRef(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    if (caretRef.current != null && enterSends()) {
      el.focus()
      el.setSelectionRange(caretRef.current, caretRef.current)
    }
    caretRef.current = null
  }, [draft])

  async function submit(e) {
    e?.preventDefault()
    if (!draft.trim() || sending) return
    if (await onSubmit(draft)) {
      setDraft('')
      setEmojiOpen(false)
    }
  }

  function pickEmoji(emoji) {
    const el = inputRef.current
    const next = insertEmoji(draft, el?.selectionStart, el?.selectionEnd, emoji)
    caretRef.current = next.caret
    if (next.text.length <= CHAT_BODY_MAX) setDraft(next.text)
  }

  const canSend = Boolean(draft.trim()) && !sending

  return (
    <form className="chat-compose" onSubmit={(e) => void submit(e)}>
      {sendError ? (
        <p className="chat-compose__error" role="alert">
          {sendError}
        </p>
      ) : null}
      {emojiOpen ? <ChatEmojiPicker onPick={pickEmoji} onSticker={(id) => void onSubmit({ sticker: id })} sending={sending} /> : null}
      <div className="chat-compose__row">
        <div className="chat-compose__pill">
          <button
            type="button"
            className={`chat-compose__emoji${emojiOpen ? ' is-active' : ''}`}
            aria-label={emojiOpen ? 'Клавиатура' : 'Смайлики и стикеры'}
            aria-expanded={emojiOpen}
            title={emojiOpen ? 'Клавиатура' : 'Смайлики и стикеры'}
            data-testid="chat-emoji-toggle"
            onClick={() => {
              setEmojiOpen((v) => !v)
              if (emojiOpen) inputRef.current?.focus()
            }}
          >
            {emojiOpen ? <Keyboard size={22} aria-hidden /> : <Smile size={22} aria-hidden />}
          </button>
          <textarea
            ref={inputRef}
            className="chat-compose__input"
            rows={1}
            value={draft}
            maxLength={CHAT_BODY_MAX}
            placeholder={placeholder}
            aria-label="Текст сообщения"
            data-testid="chat-input"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
              if (e.ctrlKey || e.metaKey || (!e.shiftKey && enterSends())) void submit(e)
            }}
          />
        </div>
        <button
          type="submit"
          className={`chat-compose__send${canSend ? ' is-ready' : ''}`}
          disabled={!canSend}
          title="Отправить"
          aria-label="Отправить"
          data-testid="chat-send"
        >
          <Send size={20} aria-hidden />
        </button>
      </div>
    </form>
  )
}
