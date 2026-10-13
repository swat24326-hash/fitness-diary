import { chatUnreadBadge } from '../../lib/chat/chatUiCore.js'

/**
 * Папки сообщений с числом диалогов, ждущих ответа: «Клиенты · Коллеги · Администрация» или клубы у админа.
 * Вид задаёт ширина экрана (messenger-layout.css): на мониторе — столбик с иконками, как Telegram, уже — кнопки.
 * @param {{
 *   folders: Array<{ id: string, label: string, unread: number, icon?: import('react').ComponentType<{ size?: number, className?: string }>, count?: number, sep?: boolean }>,
 *   active: string,
 *   onChange: (id: string) => void,
 *   label?: string,
 *   testId?: string,
 * }} props
 */
export function ChatFolders({ folders, active, onChange, label = 'Папки сообщений', testId = 'chat-folders' }) {
  return (
    <nav className="chat-folders" aria-label={label} data-testid={testId}>
      {folders.map((f) => {
        const on = f.id === active
        const badge = chatUnreadBadge(f.unread)
        const Icon = f.icon
        return (
          <button
            key={f.id}
            type="button"
            className={`chat-folders__tab${on ? ' chat-folders__tab--on' : ''}${f.sep ? ' chat-folders__tab--sep' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(f.id)}
            title={f.label}
          >
            {Icon ? <Icon size={18} aria-hidden className="chat-folders__icon" /> : null}
            <span className="chat-folders__label">{f.label}</span>
            {badge ? (
              <span className="chat-folders__badge" aria-label={`Ждут ответа: ${badge}`}>
                {badge}
              </span>
            ) : f.count != null ? (
              <small className="chat-folders__count">{f.count}</small>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
