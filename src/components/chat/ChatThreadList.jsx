import { Link } from 'react-router-dom'
import { ChatRowBody } from './ChatRowBody.jsx'

/**
 * Список диалогов как в Telegram: аватарка, имя и время, последнее сообщение и число новых.
 * selected — открыт справа (планшет), строка подсвечена.
 * @param {{ rows: Array<{ key: string, to: string, kind: string, title: string, avatar?: string, preview: string, unread: boolean, unreadCount?: number, at?: string|null, selected?: boolean }> }} props
 */
export function ChatThreadList({ rows }) {
  return (
    <ol className="chat-list" data-testid="chat-threads">
      {rows.map(({ key, to, selected = false, ...row }, i) => (
        <li key={key} style={{ '--i': i }}>
          <Link
            to={to}
            className={`chat-row${row.unread ? ' chat-row--new' : ''}${selected ? ' chat-row--selected' : ''}`}
            aria-current={selected ? 'true' : undefined}
          >
            <ChatRowBody {...row} />
          </Link>
        </li>
      ))}
    </ol>
  )
}
