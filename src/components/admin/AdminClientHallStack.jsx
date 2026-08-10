import { Link } from 'react-router-dom'

/**
 * Стек залов в выдаче поиска: ПЗ / ТЗ / АЗ друг под другом.
 * @param {{
 *   items: Array<{ hall: string, label: string, summary: string, hrefHall: string, signalColor?: string }>,
 *   buildHref: (hall: string) => string,
 *   linkState?: object,
 * }} props
 */
export function AdminClientHallStack({ items = [], buildHref, linkState }) {
  if (!items.length) return null
  return (
    <div className="admin-client-hall-stack" aria-label="Абонементы по залам">
      {items.map((row) => (
        <div key={row.hall} className="admin-client-hall-stack__row">
          <span
            className="admin-client-hall-stack__dot"
            style={row.signalColor ? { background: row.signalColor } : undefined}
            aria-hidden
          />
          <div className="admin-client-hall-stack__body">
            <span className="admin-client-hall-stack__hall">{row.label}</span>
            <span className="admin-client-hall-stack__summary">{row.summary}</span>
          </div>
          {typeof buildHref === 'function' ? (
            <Link
              to={buildHref(row.hrefHall || row.hall)}
              state={linkState}
              className="btn btn-ghost btn-sm admin-client-hall-stack__open"
            >
              Открыть
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  )
}
