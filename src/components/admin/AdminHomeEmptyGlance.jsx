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
        {Icon ? (
          <span className="admin-home-soft-signal__icon" aria-hidden>
            <Icon size={18} />
          </span>
        ) : null}
      </span>
      <span className="admin-home-soft-signal__empty-text muted">{text}</span>
      <span className="admin-home-soft-signal__cta muted">{cta}</span>
    </Link>
  )
}
