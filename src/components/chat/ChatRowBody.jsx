import { Building2, Crown, Dumbbell, Handshake, Users } from 'lucide-react'
import { chatTimeRu } from '../../lib/chat/chatMessageCore.js'
import { chatInitials, chatUnreadBadge } from '../../lib/chat/chatUiCore.js'
import { AvatarPhoto } from '../profile/AvatarPhoto.jsx'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'
import '../../styles/chat-reactions.css'

const KIND_ICON = { trainer: Dumbbell, sales: Handshake, supervisor: Building2, admin: Crown, group: Users }

/**
 * Внутренность строки диалога: аватарка, имя и время, последнее сообщение, число новых
 * и значок реакции собеседника на ваше сообщение, пока диалог не открыт (как в Telegram).
 * photo — фото профиля собеседника (как в Telegram); нет — инициалы по avatar или значок вида диалога.
 * @param {{ kind: string, title: string, avatar?: string, photo?: string|null, preview: string, unread: boolean, unreadCount?: number, at?: string|null, reaction?: string|null, tail?: import('react').ReactNode }} props
 */
export function ChatRowBody({ kind, title, avatar, photo = null, preview, unread, unreadCount, at, reaction, tail }) {
  const Icon = KIND_ICON[kind] ?? Building2
  const initials = chatInitials(avatar)
  const badge = chatUnreadBadge(unread ? Math.max(1, unreadCount || 0) : 0)
  return (
    <>
      <span className={`chat-row__avatar chat-row__avatar--${kind}`} aria-hidden>
        <AvatarPhoto src={photo} fallback={initials || <Icon size={22} />} />
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
