import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Search } from 'lucide-react'
import { buildStaffColumns, staffColumnsFoundRu } from '../../lib/chat/staffColumnsCore.js'
import { chatThreadPreviewRu } from '../../lib/chat/chatUiCore.js'
import { ChatRowBody } from './ChatRowBody.jsx'
import '../../styles/chat-staff-columns.css'

function previewOf(p) {
  if (!p.has_app) return `${p.role_label} · нет приложения`
  return p.has_thread ? chatThreadPreviewRu(p, 'staff') : p.role_label
}

function PersonRows({ people }) {
  return people.map((p) => (
    <li key={p.id} data-has-app={p.has_app ? '1' : '0'}>
      <Link to={`/messages/dm/${p.id}`} className={`chat-row${p.unread ? ' chat-row--new' : ''}${p.has_app ? '' : ' chat-row--dim'}`}>
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
  ))
}

/** Столбец клуба: сверху те, до кого дойдёт сейчас; без приложения — свёрнуто (при поиске раскрыто). */
function ClubColumn({ col, searching }) {
  const [open, setOpen] = useState(false)
  const showIdle = searching || open || !col.reachable.length
  return (
    <section className="staff-columns__col" aria-label={col.title}>
      <header className="staff-columns__head">
        <span className="staff-columns__head-text">
          <strong className="staff-columns__title" title={col.title}>
            {col.title}
          </strong>
          <small className="staff-columns__meta">
            в приложении {col.people.filter((p) => p.has_app).length} из {col.people.length}
          </small>
        </span>
        {col.unread ? (
          <span className="chat-row__badge" aria-label={`Ждут ответа: ${col.unread}`}>
            {col.unread}
          </span>
        ) : null}
      </header>
      <ol className="chat-list staff-columns__list">
        <PersonRows people={col.reachable} />
        {col.idle.length && col.reachable.length && !searching ? (
          <li>
            <button type="button" className="staff-columns__idle-toggle" aria-expanded={showIdle} onClick={() => setOpen((v) => !v)}>
              Без приложения · {col.idle.length}
              <ChevronDown size={16} aria-hidden className={showIdle ? 'staff-columns__chevron--open' : undefined} />
            </button>
          </li>
        ) : null}
        {showIdle ? <PersonRows people={col.idle} /> : null}
      </ol>
    </section>
  )
}

/**
 * Главный админ: клубы столбцами (вверху клуб, ниже его люди), столбцы листаются вбок.
 * Поиск один — и по клубу, и по человеку.
 * @param {{ contacts: object[] }} props
 */
export function AdminStaffColumns({ contacts }) {
  const [query, setQuery] = useState('')
  const columns = buildStaffColumns(contacts, query)
  const searching = Boolean(query.trim())
  return (
    <div className="staff-columns">
      <div className="staff-columns__bar">
        <label className="chat-contacts__search staff-columns__search">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Клуб или сотрудник"
            aria-label="Найти клуб или сотрудника"
            enterKeyHint="search"
          />
        </label>
        {searching ? (
          <small className="muted" role="status">
            {staffColumnsFoundRu(columns)}
          </small>
        ) : null}
      </div>
      {!columns.length && !searching ? <p className="muted chat-contacts__empty">Пока никого нет</p> : null}
      <div className="staff-columns__track" data-testid="staff-columns">
        {columns.map((col) => (
          <ClubColumn key={col.key || 'network'} col={col} searching={searching} />
        ))}
      </div>
    </div>
  )
}
