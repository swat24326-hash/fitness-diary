import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { chatThreadPreviewRu } from '../../lib/chat/chatUiCore.js'
import { ChatRowBody } from './ChatRowBody.jsx'

function previewOf(p) {
  if (!p.has_app) return `${p.role_label} · нет приложения`
  return p.has_thread ? chatThreadPreviewRu(p, 'staff') : p.role_label
}

function PersonRows({ people, hrefFor, selectedId }) {
  return people.map((p) => {
    const cls = `chat-row${p.unread ? ' chat-row--new' : ''}${p.has_app ? '' : ' chat-row--dim'}${p.id === selectedId ? ' chat-row--selected' : ''}`
    return (
      <li key={p.id} data-has-app={p.has_app ? '1' : '0'}>
        <Link to={hrefFor(p.id)} className={cls} aria-current={p.id === selectedId ? 'page' : undefined}>
          <ChatRowBody
            kind={p.role || 'trainer'}
            title={p.name || 'Без имени'}
            avatar={p.name}
            preview={previewOf(p)}
            unread={p.unread}
            unreadCount={p.unread_count}
            at={p.last_message_at}
            reaction={p.reaction}
          />
        </Link>
      </li>
    )
  })
}

/** Клуб в списке: сверху те, до кого дойдёт сейчас; без приложения — свёрнуто (при поиске раскрыто). */
function ClubSection({ col, withHead, searching, hrefFor, selectedId }) {
  const [open, setOpen] = useState(false)
  const showIdle = searching || open || !col.reachable.length || col.idle.some((p) => p.id === selectedId)
  const withApp = col.people.filter((p) => p.has_app).length
  return (
    <section className="admin-msgr__section" aria-label={col.title}>
      {withHead ? (
        <header className="admin-msgr__section-head">
          <strong>{col.title}</strong>
          <small>
            в приложении {withApp} из {col.people.length}
          </small>
        </header>
      ) : null}
      <ol className="chat-list">
        <PersonRows people={col.reachable} hrefFor={hrefFor} selectedId={selectedId} />
        {col.idle.length && col.reachable.length && !searching ? (
          <li>
            <button type="button" className="admin-msgr__idle-toggle" aria-expanded={showIdle} onClick={() => setOpen((v) => !v)}>
              Без приложения · {col.idle.length}
              <ChevronDown size={16} aria-hidden className={showIdle ? 'admin-msgr__chevron--open' : undefined} />
            </button>
          </li>
        ) : null}
        {showIdle ? <PersonRows people={col.idle} hrefFor={hrefFor} selectedId={selectedId} /> : null}
      </ol>
    </section>
  )
}

/**
 * Люди выбранного клуба (или всех клубов — с заголовками клубов, как разделы в Telegram).
 * @param {{ sections: object[], searching: boolean, hrefFor: (id: string) => string, selectedId: string, emptyText: string }} props
 */
export function AdminStaffList({ sections, searching, hrefFor, selectedId, emptyText }) {
  if (!sections.length) return <p className="muted chat-contacts__empty">{emptyText}</p>
  const withHead = sections.length > 1 || searching
  return (
    <div className="admin-msgr__people" data-testid="staff-people">
      {sections.map((col) => (
        <ClubSection key={col.key || 'network'} col={col} withHead={withHead} searching={searching} hrefFor={hrefFor} selectedId={selectedId} />
      ))}
    </div>
  )
}
