import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, Cake, CalendarClock, Clock, Gauge, History, TrendingUp, UserX } from 'lucide-react'
import { formatIsoRu } from '../../lib/period'
import {
  buildAdminDaySummaryCards,
  groupAdminDaySummaryCards,
} from '../../lib/admin/adminDaySummaryUiCore.js'

const ICONS = {
  userX: UserX,
  clock: Clock,
  barChart: BarChart3,
  trending: TrendingUp,
  gauge: Gauge,
  alert: AlertTriangle,
  history: History,
  cake: Cake,
  calendarClock: CalendarClock,
}

/**
 * @param {{
 *   card: {
 *     key: string,
 *     count: number | string,
 *     label: string,
 *     hint: string,
 *     icon: string,
 *     to: string,
 *     hot?: boolean,
 *     warn?: boolean,
 *     textCount?: boolean,
 *     valueSuffix?: string | null,
 *   },
 * }} props
 */
function DaySummaryCard({ card }) {
  const { count, label, hint, icon, to, hot, warn, textCount, valueSuffix } = card
  const Icon = ICONS[icon] || BarChart3
  return (
    <li>
      <Link
        to={to}
        className={`admin-day-summary__card u-no-decoration${hot ? ' admin-day-summary__card--hot' : ''}${warn ? ' admin-day-summary__card--warn' : ''}`}
      >
        <span className="admin-day-summary__card-icon" aria-hidden>
          <Icon size={16} />
        </span>
        <span className={`admin-day-summary__card-count${textCount ? ' admin-day-summary__card-count--text' : ''}`}>
          {count}
          {valueSuffix ? <span className="admin-day-summary__card-suffix">{valueSuffix}</span> : null}
        </span>
        <span className="admin-day-summary__card-label">{label}</span>
        <span className="admin-day-summary__card-hint muted">{hint}</span>
      </Link>
    </li>
  )
}

/**
 * @param {{
 *   summary: object | null,
 *   clubId?: string,
 *   loading?: boolean,
 *   noClub?: boolean,
 *   coachQuality?: object | null,
 *   coachQualityLoading?: boolean,
 * }} props
 */
export function AdminClubDaySummaryPanel({
  summary,
  clubId = '',
  loading = false,
  noClub = false,
  coachQuality = null,
  coachQualityLoading = false,
}) {
  const cards = useMemo(
    () =>
      summary
        ? buildAdminDaySummaryCards({
            summary,
            clubId,
            coachQuality,
            coachQualityLoading,
          })
        : [],
    [summary, clubId, coachQuality, coachQualityLoading],
  )

  const groups = useMemo(() => groupAdminDaySummaryCards(cards), [cards])

  const actionableUi = useMemo(() => cards.filter((c) => c.hot || c.warn).length, [cards])

  if (noClub) {
    return (
      <section className="admin-day-summary" aria-labelledby="admin-day-summary-title">
        <h2 id="admin-day-summary-title" className="admin-day-summary__title">
          Сводка дня клуба
        </h2>
        <p className="admin-day-summary__hint muted">Выберите клуб в шапке, чтобы увидеть сводку.</p>
      </section>
    )
  }

  if (loading && !summary) {
    return (
      <section
        className="admin-day-summary admin-day-summary--skel admin-day-summary--dense"
        aria-labelledby="admin-day-summary-title"
        aria-busy="true"
      >
        <h2 id="admin-day-summary-title" className="admin-day-summary__title">
          Сводка дня клуба
        </h2>
        <ul className="admin-day-summary__skel-grid" aria-label="Загрузка сводки">
          <li className="admin-home-skel admin-day-summary__skel-card" />
          <li className="admin-home-skel admin-day-summary__skel-card" />
        </ul>
      </section>
    )
  }

  if (!summary) return null

  return (
    <section
      className="admin-day-summary admin-day-summary--dense"
      aria-labelledby="admin-day-summary-title"
      aria-busy={loading || undefined}
    >
      <div className="admin-day-summary__head">
        <h2 id="admin-day-summary-title" className="admin-day-summary__title">
          Сводка дня клуба
        </h2>
        {actionableUi === 0 ? (
          <p className="admin-day-summary__ok muted">На сегодня ({formatIsoRu(summary.today)}) всё в порядке.</p>
        ) : (
          <p className="admin-day-summary__hint muted">
            {actionableUi}{' '}
            {actionableUi === 1 ? 'пункт' : actionableUi < 5 ? 'пункта' : 'пунктов'} требуют внимания
          </p>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.id} className="admin-day-summary__section">
          <h3 className="admin-day-summary__section-title">{g.title}</h3>
          <ul
            className={`admin-day-summary__grid admin-day-summary__grid--${g.id}`}
            aria-label={g.title}
          >
            {g.cards.map((card) => (
              <DaySummaryCard key={card.key} card={card} />
            ))}
          </ul>
        </div>
      ))}

      {summary.draftsToday > 0 ? (
        <p className="admin-day-summary__note muted">
          <AlertTriangle size={14} aria-hidden /> Черновиков тренировок сегодня: {summary.draftsToday}
        </p>
      ) : null}
    </section>
  )
}
