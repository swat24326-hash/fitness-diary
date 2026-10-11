import { chatUnreadBadge } from '../../lib/chat/chatUiCore.js'

/**
 * Вкладки папок «Клиенты · Коллеги · Администрация» с числом диалогов, ждущих ответа.
 * @param {{ folders: Array<{ id: string, label: string, unread: number }>, active: string, onChange: (id: string) => void }} props
 */
export function ChatFolders({ folders, active, onChange }) {
  return (
    <nav className="chat-folders" aria-label="Папки сообщений" data-testid="chat-folders">
      {folders.map((f) => {
        const on = f.id === active
        const badge = chatUnreadBadge(f.unread)
        return (
          <button
            key={f.id}
            type="button"
            className={`chat-folders__tab${on ? ' chat-folders__tab--on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(f.id)}
          >
            {f.label}
            {badge ? <span className="chat-folders__badge" aria-label={`Ждут ответа: ${badge}`}>{badge}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
