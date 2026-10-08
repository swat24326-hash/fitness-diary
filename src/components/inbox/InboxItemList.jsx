import { Link } from 'react-router-dom'
import { ChevronRight, ClipboardList, Megaphone } from 'lucide-react'
import { formatDateRu } from '../../lib/dateRu.js'
import { inboxItemMetaRu } from '../../lib/client/clientInboxUiCore.js'

/**
 * Строки «Входящих»: новые с точкой, опрос — планшет, объявление — рупор.
 * @param {{ items: object[], basePath: string }} props
 */
export function InboxItemList({ items, basePath }) {
  return (
    <ol className="client-inbox">
      {items.map((it, i) => {
        const Icon = it.kind === 'survey' ? ClipboardList : Megaphone
        return (
          <li key={it.id} style={{ '--i': i }}>
            <Link to={`${basePath}/${it.id}`} className={`client-inbox__row${it.attention ? ' client-inbox__row--new' : ''}`}>
              <span className="client-inbox__icon" aria-hidden>
                <Icon size={20} />
              </span>
              <span className="client-inbox__body">
                <strong>{it.title}</strong>
                <small>
                  {inboxItemMetaRu(it)} · {formatDateRu(String(it.sent_at).slice(0, 10))}
                </small>
              </span>
              {it.attention ? <span className="client-inbox__dot" aria-label="Новое" /> : null}
              <ChevronRight size={18} className="client-inbox__go" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
