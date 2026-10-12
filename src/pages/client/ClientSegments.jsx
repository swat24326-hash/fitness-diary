import { Link } from 'react-router-dom'
import { inboxBadgeText } from '../../lib/client/clientInboxUiCore.js'

/**
 * Переключатель из двух-трёх разделов внутри вкладки («Задание | Питание», «Диалоги | Опросы»).
 * Разделы — адреса (replace): «Назад» и push ведут прямо в нужный.
 * @param {{ label: string, items: { key: string, to: string, label: string, icon: Function, active: boolean, count?: number, dot?: boolean }[] }} props
 */
export function ClientSegments({ label, items }) {
  return (
    <nav className="client-segments" aria-label={label}>
      {items.map(({ key, to, label: text, icon: Icon, active, count = 0, dot = false }) => {
        const badge = inboxBadgeText(count)
        return (
          <Link
            key={key}
            to={to}
            replace
            className={`client-segments__opt${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={`${text}${badge ? `, новых ${count}` : dot ? ', новое' : ''}`}
          >
            <Icon size={18} aria-hidden />
            {text}
            {badge ? (
              <span className="client-segments__badge" aria-hidden>
                {badge}
              </span>
            ) : dot ? (
              <span className="client-segments__dot" aria-hidden />
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
