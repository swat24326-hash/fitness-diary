import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { buildStaffColumns } from '../../lib/chat/staffColumnsCore.js'
import { chatThreadPreviewRu } from '../../lib/chat/chatUiCore.js'
import { ChatRowBody } from './ChatRowBody.jsx'
import '../../styles/chat-staff-columns.css'

function previewOf(p) {
  if (!p.has_app) return `${p.role_label} · нет приложения`
  return p.has_thread ? chatThreadPreviewRu(p, 'staff') : p.role_label
}

/**
 * Главный админ: клубы столбцами (вверху клуб, ниже его люди), столбцы листаются вбок.
 * Поиск один — и по клубу, и по человеку.
 * @param {{ contacts: object[] }} props
 */
export function AdminStaffColumns({ contacts }) {
  const [query, setQuery] = useState('')
  const columns = buildStaffColumns(contacts, query)
  return (
    <div className="staff-columns">
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
      {!columns.length ? <p className="muted chat-contacts__empty">{query ? 'Никого не нашли' : 'Пока никого нет'}</p> : null}
      <div className="staff-columns__track" data-testid="staff-columns">
        {columns.map((col) => (
          <section key={col.key || 'network'} className="staff-columns__col" aria-label={col.title}>
            <header className="staff-columns__head">
              <strong className="staff-columns__title">{col.title}</strong>
              <span className="staff-columns__count">{col.people.length}</span>
              {col.unread ? (
                <span className="chat-row__badge" aria-label={`Ждут ответа: ${col.unread}`}>
                  {col.unread}
                </span>
              ) : null}
            </header>
            <ol className="chat-list staff-columns__list">
              {col.people.map((p) => (
                <li key={p.id} data-has-app={p.has_app ? '1' : '0'}>
                  <Link
                    to={`/messages/dm/${p.id}`}
                    className={`chat-row${p.unread ? ' chat-row--new' : ''}${p.has_app ? '' : ' chat-row--dim'}`}
                  >
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
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
