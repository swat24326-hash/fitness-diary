import { useEffect, useRef, useState } from 'react'
import { Keyboard, Send, Smile } from 'lucide-react'
import { useChatAttachDraft } from '../../hooks/useChatAttachDraft.js'
import { useChatVideoRecord } from '../../hooks/useChatVideoRecord.js'
import { useChatVoiceRecord } from '../../hooks/useChatVoiceRecord.js'
import { CHAT_BODY_MAX, CHAT_PASTE_CUT_RU, chatLengthCounter, chatPasteCut } from '../../lib/chat/chatMessageCore.js'
import { insertEmoji } from '../../lib/chat/chatEmojiCore.js'
import { rememberSentEmoji } from '../../lib/chat/chatEmojiUsageStore.js'
import { ChatAttachButton, ChatAttachDraft } from './ChatAttachDraft.jsx'
import { ChatEmojiPicker } from './ChatEmojiPicker.jsx'
import { ChatReplyQuote } from './ChatReplyQuote.jsx'
import { ChatVideoButton, ChatVideoCircle, ChatVideoPanel } from './ChatVideoRecorder.jsx'
import { ChatVoiceButton, ChatVoicePanel } from './ChatVoiceRecorder.jsx'

/** На компьютере Enter отправляет (Shift+Enter — перенос), на тач-экране Enter — перенос, как в Telegram. */
function enterSends() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
}

/**
 * Поле ввода переписки: капсула со смайликами и стикерами, круглая кнопка «Отправить».
 * @param {{ onSubmit: (input: string | { sticker: string } | { audio: string, sec: number, wave: number[], silent?: boolean }) => Promise<boolean>,
 *   sending: boolean, sendError: string, placeholder: string, above?: import('react').ReactNode }} props
 * above — висит над полем и едет вместе с ним над клавиатурой (кнопка «↓ Новые»)
 * replyTo — «Ответ …» над полем (крестик или Esc — onCancelReply); выбрали «Ответить» — фокус в поле, как в Telegram
 * voiceEnabled — поле пустое: вместо «Отправить» 🎤, голосовое как в Telegram (useChatVoiceRecord);
 * короткое касание 🎤 пальцем — 📹 видеокружок (useChatVideoRecord), ещё раз — обратно;
 * voiceDraftKey — диалог: ушли посреди записи — она ждёт тут черновиком
 * attachEnabled — скрепка: фото / PDF (ещё вставка картинки и перетаскивание файла); текст поля уходит подписью
 * initialDraft — текст в поле при открытии (центр сбоев: «что сказать тренеру»), отправляет человек сам
 */
export function ChatComposer({
  onSubmit,
  sending,
  sendError,
  placeholder,
  above = null,
  replyTo = null,
  onCancelReply,
  voiceEnabled = false,
  voiceDraftKey = '',
  attachEnabled = false,
  initialDraft = '',
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [pasteCut, setPasteCut] = useState(false)
  const inputRef = useRef(null)
  const caretRef = useRef(null)
  const vid = useChatVideoRecord({ send: onSubmit, enabled: voiceEnabled })
  const rec = useChatVoiceRecord({ send: onSubmit, enabled: voiceEnabled, draftKey: voiceDraftKey, onTap: vid.available ? vid.toggleMode : null })
  const att = useChatAttachDraft()
  const filming = vid.phase !== 'idle' && !vid.armed
  const recording = (rec.phase !== 'idle' && !rec.armed) || filming
  const hasAttach = Boolean(att.item)

  useEffect(() => {
    if (recording) setEmojiOpen(false)
  }, [recording])

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
    if ((!draft.trim() && !hasAttach) || sending || recording || att.busy) return
    if (await onSubmit(hasAttach ? { attach: att.payload, body: draft } : draft)) {
      rememberSentEmoji(draft)
      setDraft('')
      setPasteCut(false)
      setEmojiOpen(false)
      att.clear()
    }
  }

  /** Картинка из буфера (скриншот) или файл, брошенный на поле, — во вложение. */
  function takeFile(e, files) {
    const file = attachEnabled && !recording ? [...(files ?? [])].find((f) => f.type.startsWith('image/') || f.type === 'application/pdf') : null
    if (!file) return false
    e.preventDefault()
    void att.pick(file)
    return true
  }

  /* Фокус остаётся в поле: иначе iPhone прячет клавиатуру, поле съезжает из-под пальца и нажатие не отправляет. */
  function keepKeyboard(e) {
    if (document.activeElement === inputRef.current) e.preventDefault()
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

  const canSend = (Boolean(draft.trim()) || hasAttach) && !sending && !att.busy
  const showVoice = rec.available && (recording || (!draft.trim() && !hasAttach && !att.busy))
  const counter = chatLengthCounter(draft.length)

  return (
    <form
      className="chat-compose"
      onSubmit={(e) => void submit(e)}
      onDragOver={(e) => attachEnabled && e.dataTransfer?.types?.includes('Files') && e.preventDefault()}
      onDrop={(e) => takeFile(e, e.dataTransfer?.files)}
    >
      {above}
      {att.error ? (
        <p className="chat-compose__error" role="alert" data-testid="chat-attach-error">
          {att.error}
        </p>
      ) : null}
      {sendError ? (
        <p className="chat-compose__error" role="alert">
          {sendError}
        </p>
      ) : null}
      {rec.error || vid.error ? (
        <p className="chat-compose__error" role="alert" data-testid="chat-voice-error">
          {rec.error || vid.error}
        </p>
      ) : null}
      {rec.hint || vid.hint ? (
        <p className="chat-compose__hint" role="status" data-testid="chat-voice-hint">
          {vid.hint || rec.hint}
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
      {recording ? null : <ChatAttachDraft att={att} />}
      {emojiOpen ? <ChatEmojiPicker onPick={pickEmoji} onSticker={(id) => void sendSticker(id)} sending={sending} /> : null}
      {filming ? <ChatVideoCircle vid={vid} /> : null}
      <div className="chat-compose__row">
        <div className="chat-compose__pill">
          {filming ? <ChatVideoPanel vid={vid} /> : recording ? <ChatVoicePanel rec={rec} /> : null}
          <button
            type="button"
            hidden={recording}
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
            hidden={recording}
            className="chat-compose__input"
            rows={1}
            value={draft}
            maxLength={CHAT_BODY_MAX}
            placeholder={hasAttach ? 'Подпись' : placeholder}
            aria-label="Текст сообщения"
            data-testid="chat-input"
            onChange={(e) => {
              setDraft(e.target.value)
              rec.clearError()
              vid.clearError()
              if (e.target.value.length < CHAT_BODY_MAX) setPasteCut(false)
            }}
            onPaste={(e) => {
              if (takeFile(e, e.clipboardData?.files)) return
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
          {attachEnabled && !recording ? <ChatAttachButton onPick={(file) => void att.pick(file)} disabled={sending} /> : null}
        </div>
        {showVoice ? (
          filming || (vid.mode === 'video' && rec.phase === 'idle') ? <ChatVideoButton vid={vid} /> : <ChatVoiceButton rec={rec} />
        ) : (
          <button
            type="submit"
            className={`chat-compose__send${canSend ? ' is-ready' : ''}`}
            disabled={!canSend}
            title="Отправить"
            aria-label="Отправить"
            data-testid="chat-send"
            onPointerDown={keepKeyboard}
            onMouseDown={keepKeyboard}
          >
            <Send size={20} aria-hidden />
          </button>
        )}
      </div>
    </form>
  )
}
