import { Building2, Inbox, Users } from 'lucide-react'
import { STAFF_VIEW_ALL, STAFF_VIEW_UNREAD } from '../../lib/chat/staffColumnsCore.js'

const ICON = { [STAFF_VIEW_ALL]: Users, [STAFF_VIEW_UNREAD]: Inbox }

/**
 * Клубы слева, как папки Telegram: «Все клубы», «Ждут ответа», затем клубы с числом новых.
 * @param {{ items: ReturnType<typeof import('../../lib/chat/staffColumnsCore.js').staffClubRail>, view: string, onPick: (key: string) => void }} props
 */
export function AdminClubRail({ items, view, onPick }) {
  return (
    <nav className="admin-msgr__rail" aria-label="Клубы">
      {items.map((it) => {
        const Icon = ICON[it.key] ?? Building2
        const active = it.key === view
        return (
          <button
            key={it.key}
            type="button"
            className={`admin-msgr__club${active ? ' admin-msgr__club--active' : ''}`}
            aria-pressed={active}
            onClick={() => onPick(it.key)}
            title={it.title}
          >
            <Icon size={18} aria-hidden className="admin-msgr__club-icon" />
            <span className="admin-msgr__club-title">{it.title}</span>
            {it.unread ? (
              <span className="chat-row__badge" aria-label={`Ждут ответа: ${it.unread}`}>
                {it.unread}
              </span>
            ) : (
              <small className="admin-msgr__club-count">{it.total}</small>
            )}
          </button>
        )
      })}
    </nav>
  )
}
