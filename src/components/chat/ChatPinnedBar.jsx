import { Pin, X } from 'lucide-react'
import { STAFF_GROUP_PINNED_TITLE_RU } from '../../lib/chat/staffGroupPinCore.js'
import '../../styles/chat-pinned.css'

/**
 * Закреплённое сообщение над лентой, как в Telegram: нажатие — к сообщению, крестик — открепить (если можно).
 * @param {{ pinned: { id: string, text: string } | null, onOpen: (id: string) => void, onUnpin?: () => void }} props
 */
export function ChatPinnedBar({ pinned, onOpen, onUnpin }) {
  if (!pinned) return null
  return (
    <div className="chat-pinned" data-testid="chat-pinned">
      <button type="button" className="chat-pinned__open" onClick={() => onOpen(pinned.id)} aria-label={`${STAFF_GROUP_PINNED_TITLE_RU}: ${pinned.text}. Показать`}>
        <span className="chat-pinned__title">{STAFF_GROUP_PINNED_TITLE_RU}</span>
        <span className="chat-pinned__text">{pinned.text}</span>
      </button>
      {onUnpin ? (
        <button type="button" className="chat-pinned__unpin" onClick={onUnpin} aria-label="Открепить" title="Открепить">
          <X size={18} aria-hidden />
        </button>
      ) : (
        <Pin size={16} aria-hidden className="chat-pinned__icon" />
      )}
    </div>
  )
}
