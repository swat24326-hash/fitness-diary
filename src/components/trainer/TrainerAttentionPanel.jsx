import { Link } from 'react-router-dom'
import { AlertTriangle, Cake, CalendarClock, Clock, UserPlus } from 'lucide-react'
import {
  buildTrainerAttentionItems,
  groupTrainerAttentionItems,
} from '../../lib/trainer/trainerAttentionUiCore.js'

const ICONS = {
  pnk: UserPlus,
  birthdays: Cake,
  expiring: Clock,
  expired_recent: AlertTriangle,
  stale: CalendarClock,
}

/**
 * @param {{
 *   summary: {
 *     birthdays: number,
 *     expiring: number,
 *     expired_recent: number,
 *     stale: number,
 *     pnk?: number,
 *     actionable: number,
 *     staleDays: number,
 *     staleMaxDays?: number,
 *   } | null,
 *   loading?: boolean,
 * }} props
 */
export function TrainerAttentionPanel({ summary, loading = false }) {
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

  const groups = groupTrainerAttentionItems(buildTrainerAttentionItems(summary))

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
            {summary.actionable === 1 ? 'повод' : summary.actionable < 5 ? 'повода' : 'поводов'} — Max и воронка ПНК
          </p>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.id} className="trainer-attention__section">
          <h3 className="trainer-attention__section-title">{g.title}</h3>
          <ul className={`trainer-attention__grid trainer-attention__grid--${g.id}`} aria-label={g.title}>
            {g.cards.map(({ key, count, label, hint, to }) => {
              const Icon = ICONS[key] || Clock
              return (
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
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
