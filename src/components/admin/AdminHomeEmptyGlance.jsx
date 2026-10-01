import { Link } from 'react-router-dom'

/**
 * Пустое состояние карточки ряда главной — карточка остаётся на месте и ведёт в раздел.
 * @param {{ href: string, title: string, text: string, cta?: string, icon?: import('react').ElementType }} props
 */
export function AdminHomeEmptyGlance({ href, title, text, cta = 'Открыть', icon: Icon }) {
  return (
    <Link
      to={href}
      className="admin-home-soft-signal admin-home-soft-signal--empty u-no-decoration"
      title={`${title}: ${text}`}
    >
      <span className="admin-home-soft-signal__head">
        <span className="admin-home-soft-signal__title">{title}</span>
      </span>
      <span className="admin-home-soft-signal__empty-body">
        {Icon ? (
          <span className="admin-home-soft-signal__empty-icon" aria-hidden>
            <Icon size={34} strokeWidth={1.75} />
          </span>
        ) : null}
        <span className="admin-home-soft-signal__empty-text muted">{text}</span>
      </span>
      <span className="admin-home-soft-signal__cta muted">{cta}</span>
    </Link>
  )
}
