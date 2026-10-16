import { Link } from 'react-router-dom'
import { ClipboardList, Salad, ChevronRight } from 'lucide-react'
import { useTrainerNotifications } from '../../pages/trainer/useTrainerNotifications.js'

function NotifIcon({ kind }) {
  if (String(kind).startsWith('nutrition')) return <Salad size={20} />
  return <ClipboardList size={20} />
}

/**
 * Лента «кто открыл задание/рацион» внутри панели Планёрки.
 * @param {{ onNavigate?: () => void }} props
 */
export function TrainerInboxClientsFeed({ onNavigate }) {
  const { items, status } = useTrainerNotifications()

  if (status === 'loading' && !items.length) {
    return (
      <div className="iskra-inbox__loading muted" aria-busy>
        Загрузка…
      </div>
    )
  }

  if (!items.length) {
    return (
      <p className="iskra-inbox__empty muted">
        Пока тихо. Здесь появятся задания и рационы, которые ждут открытия или уже открыты клиентом.
      </p>
    )
  }

  return (
    <ol className="client-inbox iskra-inbox__clients" aria-label="События по клиентам">
      {items.map((it, i) => {
        const fresh = !it.read_at
        return (
          <li key={it.id} style={{ '--i': i }}>
            <Link
              to={it.deep_link}
              className={`client-inbox__row${fresh ? ' client-inbox__row--new' : ''}`}
              onClick={() => onNavigate?.()}
            >
              <span className="client-inbox__icon" aria-hidden>
                <NotifIcon kind={it.kind} />
              </span>
              <span className="client-inbox__body">
                <strong>{it.title}</strong>
                <small>{it.body}</small>
              </span>
              {fresh ? <span className="client-inbox__dot" aria-label="Ждёт" /> : null}
              <ChevronRight size={18} className="client-inbox__go" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
