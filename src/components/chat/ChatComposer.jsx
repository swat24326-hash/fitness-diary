import { useEffect, useRef, useState } from 'react'
import { Keyboard, Send, Smile } from 'lucide-react'
import { CHAT_BODY_MAX, CHAT_PASTE_CUT_RU, chatLengthCounter, chatPasteCut } from '../../lib/chat/chatMessageCore.js'
import { insertEmoji } from '../../lib/chat/chatEmojiCore.js'
import { rememberSentEmoji } from '../../lib/chat/chatEmojiUsageStore.js'
import { attachChatKeyboardInset } from '../../lib/chat/chatKeyboardInset.js'
import { ChatEmojiPicker } from './ChatEmojiPicker.jsx'
import { ChatReplyQuote } from './ChatReplyQuote.jsx'

/** На компьютере Enter отправляет (Shift+Enter — перенос), на тач-экране Enter — перенос, как в Telegram. */
function enterSends() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
}

/**
 * Поле ввода переписки: капсула со смайликами и стикерами, круглая кнопка «Отправить».
 * @param {{ onSubmit: (input: string | { sticker: string }) => Promise<boolean>, sending: boolean, sendError: string, placeholder: string, above?: import('react').ReactNode }} props
 * above — висит над полем и едет вместе с ним над клавиатурой (кнопка «↓ Новые»)
 * replyTo — «Ответ …» над полем (крестик или Esc — onCancelReply); выбрали «Ответить» — фокус в поле, как в Telegram
 */
export function ChatComposer({ onSubmit, sending, sendError, placeholder, above = null, replyTo = null, onCancelReply }) {
  const [draft, setDraft] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [pasteCut, setPasteCut] = useState(false)
  const inputRef = useRef(null)
  const caretRef = useRef(null)
  const formRef = useRef(null)

  useEffect(() => attachChatKeyboardInset(formRef.current), [])

  const replyId = replyTo?.id
  useEffect(() => {
    if (replyId) inputRef.current?.focus()
  }, [replyId])

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
      rememberSentEmoji(draft)
      setDraft('')
      setPasteCut(false)
      setEmojiOpen(false)
    }
  }

  async function sendSticker(id) {
    if (await onSubmit({ sticker: id })) rememberSentEmoji({ sticker: id })
  }

  function pickEmoji(emoji) {
    const el = inputRef.current
    const next = insertEmoji(draft, el?.selectionStart, el?.selectionEnd, emoji)
    caretRef.current = next.caret
    if (next.text.length <= CHAT_BODY_MAX) setDraft(next.text)
  }

  const canSend = Boolean(draft.trim()) && !sending
  const counter = chatLengthCounter(draft.length)

  return (
    <form ref={formRef} className="chat-compose" onSubmit={(e) => void submit(e)}>
      {above}
      {sendError ? (
        <p className="chat-compose__error" role="alert">
          {sendError}
        </p>
      ) : null}
      {pasteCut ? (
        <p className="chat-compose__error" role="alert" data-testid="chat-paste-cut">
          {CHAT_PASTE_CUT_RU}
        </p>
      ) : null}
      {counter ? (
        <p className={`chat-compose__counter${draft.length >= CHAT_BODY_MAX ? ' is-full' : ''}`} data-testid="chat-counter">
          {counter}
        </p>
      ) : null}
      {replyTo && onCancelReply ? <ChatReplyQuote quote={replyTo} onCancel={onCancelReply} /> : null}
      {emojiOpen ? <ChatEmojiPicker onPick={pickEmoji} onSticker={(id) => void sendSticker(id)} sending={sending} /> : null}
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
            onChange={(e) => {
              setDraft(e.target.value)
              if (e.target.value.length < CHAT_BODY_MAX) setPasteCut(false)
            }}
            onPaste={(e) => {
              const el = e.currentTarget
              const pasted = e.clipboardData?.getData('text')?.length ?? 0
              setPasteCut(chatPasteCut(draft.length, el.selectionEnd - el.selectionStart, pasted))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && replyTo && onCancelReply) {
                onCancelReply()
                return
              }
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
