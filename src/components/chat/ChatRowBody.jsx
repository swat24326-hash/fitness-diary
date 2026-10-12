import { Building2, Dumbbell, Handshake } from 'lucide-react'
import { chatTimeRu } from '../../lib/chat/chatMessageCore.js'
import { chatInitials, chatUnreadBadge } from '../../lib/chat/chatUiCore.js'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'
import '../../styles/chat-reactions.css'

const KIND_ICON = { trainer: Dumbbell, sales: Handshake, supervisor: Building2 }

/**
 * Внутренность строки диалога: аватарка, имя и время, последнее сообщение, число новых
 * и значок реакции собеседника на ваше сообщение, пока диалог не открыт (как в Telegram).
 * @param {{ kind: string, title: string, avatar?: string, preview: string, unread: boolean, unreadCount?: number, at?: string|null, reaction?: string|null, tail?: import('react').ReactNode }} props
 */
export function ChatRowBody({ kind, title, avatar, preview, unread, unreadCount, at, reaction, tail }) {
  const Icon = KIND_ICON[kind] ?? Building2
  const initials = chatInitials(avatar)
  const badge = chatUnreadBadge(unread ? Math.max(1, unreadCount || 0) : 0)
  return (
    <>
      <span className={`chat-row__avatar chat-row__avatar--${kind}`} aria-hidden>
        {initials || <Icon size={22} />}
      </span>
      <span className="chat-row__main">
        <span className="chat-row__line">
          <strong className="chat-row__title">{title}</strong>
          {at ? <time className="chat-row__time">{chatTimeRu(at)}</time> : null}
        </span>
        <span className="chat-row__line">
          <small className="chat-row__preview">{preview}</small>
          {reaction ? (
            <span className="chat-row__reaction" aria-label={`Новая реакция ${reaction}`} data-testid="chat-row-reaction">
              <ChatEmojiGlyph emoji={reaction} />
            </span>
          ) : null}
          {badge ? (
            <span className="chat-row__badge" aria-label={`Новых: ${badge}`}>
              {badge}
            </span>
          ) : null}
          {tail}
        </span>
      </span>
    </>
  )
}
