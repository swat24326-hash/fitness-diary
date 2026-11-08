import { Link } from 'react-router-dom'
import { BellOff } from 'lucide-react'
import { AZ_GROUP_TITLE_RU, azGroupPreviewRu } from '../../lib/chat/azGroupCore.js'
import { ChatRowBody } from './ChatRowBody.jsx'
import '../../styles/chat-group.css'

/**
 * Строка группы АЗ: у инструктора — «Группа АЗ» в «Клиентах», у клиента — «Группа АЗ · имя».
 * @param {{ group: object, to: string, selected?: boolean }} props
 */
export function AzGroupRow({ group, to, selected = false }) {
  const cls = `chat-row${group.unread ? ' chat-row--new' : ''}${group.muted ? ' chat-row--muted' : ''}${selected ? ' chat-row--selected' : ''}`
  return (
    <li className="staff-group__row" data-testid="az-group-row">
      <Link to={to} className={cls} aria-current={selected ? 'true' : undefined}>
        <ChatRowBody
          kind="group"
          title={group.name || AZ_GROUP_TITLE_RU}
          preview={azGroupPreviewRu(group)}
          unread={group.unread}
          unreadCount={group.unread_count}
          at={group.last_message_at}
          tail={group.muted ? <BellOff size={14} aria-label="Без звука" className="staff-group__muted-icon" /> : null}
        />
      </Link>
    </li>
  )
}
