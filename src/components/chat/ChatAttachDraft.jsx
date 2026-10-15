import { useRef } from 'react'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import { CHAT_ATTACH_TTL_HINT_RU, formatAttachSize } from '../../lib/chat/chatAttachCore.js'
import '../../styles/chat-attach.css'

/** Скрепка в поле ввода: выбор фото (камера / галерея на телефоне) или PDF. */
export function ChatAttachButton({ onPick, disabled }) {
  const inputRef = useRef(null)
  return (
    <>
      <button
        type="button"
        className="chat-compose__attach"
        aria-label="Фото или PDF"
        title="Фото или PDF"
        data-testid="chat-attach-button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={21} aria-hidden />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        hidden
        data-testid="chat-attach-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
    </>
  )
}

/** Над полем ввода: что уйдёт с сообщением — превью фото или плашка PDF, крестик — убрать. */
export function ChatAttachDraft({ att }) {
  if (!att.item && !att.busy) return null
  const { item } = att
  return (
    <div className="chat-attach-draft" data-testid="chat-attach-draft">
      {att.busy ? (
        <span className="chat-attach-draft__thumb is-busy" aria-label="Готовим файл">
          <Loader2 size={20} className="chat-attach-spin" aria-hidden />
        </span>
      ) : item.kind === 'sticker' ? (
        <img className="chat-attach-draft__thumb is-sticker" src={item.previewUrl} alt="Стикер к отправке" />
      ) : item.kind === 'photo' ? (
        <img className="chat-attach-draft__thumb" src={item.previewUrl} alt="Фото к отправке" />
      ) : (
        <span className="chat-attach-draft__thumb is-file">
          <FileText size={22} aria-hidden />
        </span>
      )}
      <span className="chat-attach-draft__text">
        <strong>{att.busy ? 'Готовим файл…' : item.kind === 'sticker' ? 'Стикер' : item.kind === 'photo' ? 'Фото' : item.name}</strong>
        <span>
          {att.busy
            ? CHAT_ATTACH_TTL_HINT_RU
            : item.kind === 'sticker'
              ? `${formatAttachSize(item.bytes)} · хранится всегда`
              : `${formatAttachSize(item.bytes)} · ${CHAT_ATTACH_TTL_HINT_RU.toLowerCase()}`}
        </span>
      </span>
      <button type="button" className="chat-attach-draft__close" aria-label="Убрать вложение" title="Убрать" onClick={att.clear}>
        <X size={18} aria-hidden />
      </button>
    </div>
  )
}
