import { Link } from 'react-router-dom'
import { ClipboardList, ExternalLink } from 'lucide-react'

/**
 * @param {{
 *   feed?: { summary?: object, items?: Array<object> } | null,
 *   clubId?: string,
 *   loading?: boolean,
 * }} props
 */
export function IskraPlanerkaFeed({ feed, clubId = '', loading = false }) {
  const items = Array.isArray(feed?.items) ? feed.items : []
  const summary = feed?.summary ?? {}
  const activeCount = Number(summary.active_count) || 0

  if (!loading && !items.length) return null

  const tasksHref = clubId ? `/admin/club-tasks?club=${encodeURIComponent(clubId)}` : '/admin/club-tasks'

  return (
    <section className="iskra-planerka-feed" aria-label="Планёрка — статусы заданий">
      <div className="iskra-planerka-feed__head">
        <div className="iskra-planerka-feed__title-row">
          <ClipboardList size={15} aria-hidden />
          <h3 className="iskra-planerka-feed__title">Планёрка</h3>
          {activeCount > 0 ? (
            <span className="iskra-planerka-feed__badge" aria-label={`${activeCount} в работе`}>
              {activeCount}
            </span>
          ) : null}
        </div>
        <Link to={tasksHref} className="iskra-planerka-feed__link">
          Все задания
          <ExternalLink size={12} aria-hidden />
        </Link>
      </div>

      {loading && !items.length ? (
        <p className="iskra-planerka-feed__loading muted">Загрузка заданий…</p>
      ) : (
        <ul className="iskra-planerka-feed__list">
          {items.map((item) => (
            <li
              key={item.id}
              className={[
                'iskra-planerka-feed__item',
                item.is_overdue ? 'iskra-planerka-feed__item--overdue' : '',
                item.status === 'done' ? 'iskra-planerka-feed__item--done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={`iskra-planerka-feed__status iskra-planerka-feed__status--${item.status}`}
              >
                {item.status_label}
              </span>
              <div className="iskra-planerka-feed__copy">
                <strong className="iskra-planerka-feed__task-title">{item.title}</strong>
                <p className="muted iskra-planerka-feed__meta">
                  {item.recipient_name}
                  {item.due_label ? ` · ${item.due_label}` : ''}
                  {item.is_overdue ? ' · просрочено' : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {Number(summary.overdue_count) > 0 ? (
        <p className="iskra-planerka-feed__hint iskra-planerka-feed__hint--warn" role="note">
          Просрочено: {summary.overdue_count}
        </p>
      ) : null}
    </section>
  )
}
