import { Link } from 'react-router-dom'
import { AlertTriangle, Cake, CalendarClock, Clock } from 'lucide-react'

/**
 * @param {{
 *   summary: {
 *     birthdays: number,
 *     expiring: number,
 *     expired_recent: number,
 *     stale: number,
 *     actionable: number,
 *     staleDays: number,
 *   } | null,
 *   previews?: Record<string, string>,
 *   loading?: boolean,
 * }} props
 */
export function TrainerAttentionPanel({ summary, previews = {}, loading = false }) {
  if (loading) {
    return (
      <section className="trainer-attention" aria-labelledby="trainer-attention-title" aria-busy="true">
        <h2 id="trainer-attention-title" className="trainer-attention__title">
          Сегодня внимание
        </h2>
        <div className="trainer-attention__loading muted" role="status">
          Загрузка…
        </div>
      </section>
    )
  }

  if (!summary) return null

  const items = [
    {
      key: 'birthdays',
      count: summary.birthdays,
      label: 'ДР сегодня',
      hint: 'поздравление',
      icon: Cake,
      to: '/trainer/clients?filter=birthdays',
    },
    {
      key: 'expiring',
      count: summary.expiring,
      label: 'Истекает',
      hint: '1–3 дня',
      icon: Clock,
      to: '/trainer/clients?filter=expiring',
    },
    {
      key: 'expired_recent',
      count: summary.expired_recent,
      label: 'Закончился',
      hint: 'сегодня/вчера',
      icon: AlertTriangle,
      to: '/trainer/clients?filter=expired_recent',
    },
    {
      key: 'stale',
      count: summary.stale,
      label: 'Давно не был',
      hint: `${summary.staleDays}+ дн.`,
      icon: CalendarClock,
      to: '/trainer/clients?filter=stale',
    },
  ]

  return (
    <section className="trainer-attention" aria-labelledby="trainer-attention-title">
      <div className="trainer-attention__head">
        <h2 id="trainer-attention-title" className="trainer-attention__title">
          Сегодня внимание
        </h2>
        {summary.actionable === 0 ? (
          <p className="trainer-attention__ok muted">Всё спокойно — срочных напоминаний нет.</p>
        ) : (
          <p className="trainer-attention__hint muted">
            {summary.actionable}{' '}
            {summary.actionable === 1 ? 'повод' : summary.actionable < 5 ? 'повода' : 'поводов'} связаться с клиентами
            через Max
          </p>
        )}
      </div>
      <ul className="trainer-attention__grid">
        {items.map(({ key, count, label, hint, icon: Icon, to }) => (
          <li key={key}>
            <Link
              to={to}
              className={`trainer-attention__card u-no-decoration${count > 0 ? ' trainer-attention__card--hot' : ''}`}
            >
              <span className="trainer-attention__card-icon" aria-hidden>
                <Icon size={18} />
              </span>
              <span className="trainer-attention__card-count">{count}</span>
              <span className="trainer-attention__card-label">{label}</span>
              <span className="trainer-attention__card-hint muted">{hint}</span>
              {count > 0 && previews[key] ? (
                <span className="trainer-attention__card-preview muted">{previews[key]}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
