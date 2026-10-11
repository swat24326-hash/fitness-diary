import { Link } from 'react-router-dom'
import { ChatRowBody } from './ChatRowBody.jsx'

/**
 * Список диалогов как в Telegram: аватарка, имя и время, последнее сообщение и число новых.
 * @param {{ rows: Array<{ key: string, to: string, kind: string, title: string, avatar?: string, preview: string, unread: boolean, unreadCount?: number, at?: string|null }> }} props
 */
export function ChatThreadList({ rows }) {
  return (
    <ol className="chat-list" data-testid="chat-threads">
      {rows.map(({ key, to, ...row }, i) => (
        <li key={key} style={{ '--i': i }}>
          <Link to={to} className={`chat-row${row.unread ? ' chat-row--new' : ''}`}>
            <ChatRowBody {...row} />
          </Link>
        </li>
      ))}
    </ol>
  )
}
