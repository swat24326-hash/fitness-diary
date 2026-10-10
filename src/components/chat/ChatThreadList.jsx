import { Link } from 'react-router-dom'
import { Building2, Dumbbell, Handshake } from 'lucide-react'
import { chatTimeRu } from '../../lib/chat/chatMessageCore.js'
import { chatInitials, chatUnreadBadge } from '../../lib/chat/chatUiCore.js'

const KIND_ICON = { trainer: Dumbbell, sales: Handshake, supervisor: Building2 }

/**
 * Список диалогов как в Telegram: аватарка, имя и время, последнее сообщение и число новых.
 * @param {{ rows: Array<{ key: string, to: string, kind: string, title: string, avatar?: string, preview: string, unread: boolean, unreadCount?: number, at?: string|null }> }} props
 */
export function ChatThreadList({ rows }) {
  return (
    <ol className="chat-list" data-testid="chat-threads">
      {rows.map((r, i) => {
        const Icon = KIND_ICON[r.kind] ?? Building2
        const initials = chatInitials(r.avatar)
        const badge = chatUnreadBadge(r.unread ? Math.max(1, r.unreadCount || 0) : 0)
        return (
          <li key={r.key} style={{ '--i': i }}>
            <Link to={r.to} className={`chat-row${r.unread ? ' chat-row--new' : ''}`}>
              <span className={`chat-row__avatar chat-row__avatar--${r.kind}`} aria-hidden>
                {initials || <Icon size={22} />}
              </span>
              <span className="chat-row__main">
                <span className="chat-row__line">
                  <strong className="chat-row__title">{r.title}</strong>
                  {r.at ? <time className="chat-row__time">{chatTimeRu(r.at)}</time> : null}
                </span>
                <span className="chat-row__line">
                  <small className="chat-row__preview">{r.preview}</small>
                  {badge ? (
                    <span className="chat-row__badge" aria-label={`Новых: ${badge}`}>
                      {badge}
                    </span>
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
