import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Send } from 'lucide-react'
import { filterChatContacts } from '../../lib/chat/chatContactsCore.js'
import { chatThreadPreviewRu } from '../../lib/chat/chatUiCore.js'
import { ChatRowBody } from './ChatRowBody.jsx'

const NO_APP_RU = 'Нет приложения'

function previewOf(c) {
  if (!c.has_app) return NO_APP_RU
  return c.has_thread ? chatThreadPreviewRu(c, 'staff') : 'Есть приложение — можно написать'
}

/**
 * Люди одной папки: с приложением — ярко (уже сверху, порядок даёт сервер), без — тускло.
 * Тусклый без переписки: нажатие — приглашение. С перепиской — открыть историю, рядом «Пригласить».
 * Без onInvite (коллеги) тусклому всё равно можно написать — увидит на планшете.
 * kind — аватарка по умолчанию; у сотрудника своя по роли (c.role).
 * selectedId — открыт справа (планшет), строка подсвечена.
 * pinned — строка над людьми (чат клуба в «Коллегах»), пока не ищут по имени.
 * @param {{ contacts: object[], kind: string, hrefFor: (c: object) => string, onInvite?: (c: object) => void, selectedId?: string, pinned?: import('react').ReactNode }} props
 */
export function ChatContactList({ contacts, kind, hrefFor, onInvite, selectedId = '', pinned = null }) {
  const [query, setQuery] = useState('')
  const shown = filterChatContacts(contacts, query)
  const top = query.trim() ? null : pinned
  return (
    <div className="chat-contacts">
      <label className="chat-contacts__search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти по имени"
          aria-label="Найти по имени"
          enterKeyHint="search"
        />
      </label>
      {!shown.length && !top ? <p className="muted chat-contacts__empty">{query ? 'Никого не нашли' : 'Пока никого нет'}</p> : null}
      <ol className="chat-list" data-testid="chat-contacts">
        {top}
        {shown.map((c, i) => {
          const dim = !c.has_app
          const body = (
            <ChatRowBody
              kind={c.role || kind}
              title={c.club_name ? `${c.name || 'Без имени'} · ${c.club_name}` : c.name || 'Без имени'}
              avatar={c.name}
              photo={c.photo}
              status={c.status}
              preview={previewOf(c)}
              unread={c.unread}
              unreadCount={c.unread_count}
              at={c.last_message_at}
              reaction={c.reaction}
              tail={dim && !c.has_thread && onInvite ? <span className="chat-contacts__invite-tag">Пригласить</span> : null}
            />
          )
          const cls = `chat-row${c.unread ? ' chat-row--new' : ''}${dim ? ' chat-row--dim' : ''}${selectedId && c.id === selectedId ? ' chat-row--selected' : ''}`
          return (
            <li key={c.id} style={{ '--i': Math.min(i, 10) }} className="chat-contacts__item" data-has-app={dim ? '0' : '1'}>
              {dim && !c.has_thread && onInvite ? (
                <button type="button" className={cls} onClick={() => onInvite(c)}>
                  {body}
                </button>
              ) : (
                <Link to={hrefFor(c)} className={cls} aria-current={selectedId && c.id === selectedId ? 'true' : undefined}>
                  {body}
                </Link>
              )}
              {dim && c.has_thread && onInvite ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon-square btn-touch chat-contacts__invite"
                  onClick={() => onInvite(c)}
                  aria-label="Пригласить"
                  title="Пригласить в приложение"
                >
                  <Send size={18} aria-hidden />
                </button>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
