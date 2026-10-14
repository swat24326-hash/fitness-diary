import { Link } from 'react-router-dom'
import { BellOff } from 'lucide-react'
import { STAFF_GROUP_TITLE_RU, staffGroupPreviewRu } from '../../lib/chat/staffGroupCore.js'
import { ChatRowBody } from './ChatRowBody.jsx'
import '../../styles/chat-group.css'

/**
 * Строка чата клуба: у сотрудника — первой в «Коллегах», у главного админа — по клубам.
 * title — по умолчанию «Чат клуба»; у админа — название клуба.
 * @param {{ group: object, to: string, selected?: boolean, title?: string }} props
 */
export function StaffGroupRow({ group, to, selected = false, title = STAFF_GROUP_TITLE_RU }) {
  const cls = `chat-row${group.unread ? ' chat-row--new' : ''}${group.muted ? ' chat-row--muted' : ''}${selected ? ' chat-row--selected' : ''}`
  return (
    <li className="staff-group__row" data-testid="group-row">
      <Link to={to} className={cls} aria-current={selected ? 'true' : undefined}>
        <ChatRowBody
          kind="group"
          title={title}
          preview={staffGroupPreviewRu(group)}
          unread={group.unread}
          unreadCount={group.unread_count}
          at={group.last_message_at}
          tail={group.muted ? <BellOff size={14} aria-label="Без звука" className="staff-group__muted-icon" /> : null}
        />
      </Link>
    </li>
  )
}
