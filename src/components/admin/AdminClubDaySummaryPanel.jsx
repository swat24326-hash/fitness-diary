import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, Cake, CalendarClock, Clock, Gauge, History, UserX } from 'lucide-react'
import {
  buildAdminDaySummaryCards,
  groupAdminDaySummaryCards,
} from '../../lib/admin/adminDaySummaryUiCore.js'

const ICONS = {
  userX: UserX,
  clock: Clock,
  barChart: BarChart3,
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
  const { count, label, hint, icon, to, hot, warn, textCount, valueSuffix, compact } = card
  const Icon = ICONS[icon] || BarChart3
  return (
    <li>
      <Link
        to={to}
        className={`admin-day-summary__card u-no-decoration${hot ? ' admin-day-summary__card--hot' : ''}${warn ? ' admin-day-summary__card--warn' : ''}${compact ? ' admin-day-summary__card--compact' : ''}${card.key === 'coachQuality' && compact ? ' admin-day-summary__card--cq-echo' : ''}`}
      >
        <span className="admin-day-summary__card-icon" aria-hidden>
          <Icon size={compact ? 14 : 16} />
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
 *   clientsPath?: string,
 *   statsPath?: string,
 *   statsTab?: string,
 *   loading?: boolean,
 *   noClub?: boolean,
 *   coachQuality?: object | null,
 *   coachQualityLoading?: boolean,
 *   coachQualityHeroInAttention?: boolean,
 *   includeCoachQuality?: boolean,
 *   onRetry?: () => void,
 * }} props
 */
export function AdminClubDaySummaryPanel({
  summary,
  clubId = '',
  clientsPath = '/admin/clients',
  statsPath = '/admin/statistics',
  statsTab = '',
  loading = false,
  noClub = false,
  coachQuality = null,
  coachQualityLoading = false,
  coachQualityHeroInAttention = false,
  includeCoachQuality = true,
  onRetry,
}) {
  const cards = useMemo(
    () =>
      summary
        ? buildAdminDaySummaryCards({
            summary,
            clubId,
            clientsPath,
            statsPath,
            statsTab,
            coachQuality,
            coachQualityLoading,
            coachQualityHeroInAttention,
            includeCoachQuality,
          })
        : [],
    [
      summary,
      clubId,
      clientsPath,
      statsPath,
      statsTab,
      coachQuality,
      coachQualityLoading,
      coachQualityHeroInAttention,
      includeCoachQuality,
    ],
  )

  const groups = useMemo(() => groupAdminDaySummaryCards(cards), [cards])

  const actionableUi = useMemo(() => cards.filter((c) => c.hot || c.warn).length, [cards])

  if (noClub) {
    return (
      <section className="admin-day-summary" aria-label="Сводка дня клуба">
        <p className="admin-day-summary__hint muted">Выберите клуб в шапке</p>
      </section>
    )
  }

  if (loading && !summary) {
    return (
      <section
        className="admin-day-summary admin-day-summary--skel admin-day-summary--dense"
        aria-label="Сводка дня клуба"
        aria-busy="true"
      >
        <div className="admin-day-summary__section admin-day-summary__section--base">
          <div className="admin-day-summary__section-head">
            <h3 className="admin-day-summary__section-title">База и поводы</h3>
          </div>
          <ul className="admin-day-summary__skel-grid" aria-label="Загрузка сводки">
            <li className="admin-home-skel admin-day-summary__skel-card" />
            <li className="admin-home-skel admin-day-summary__skel-card" />
            {includeCoachQuality ? <li className="admin-home-skel admin-day-summary__skel-card" /> : null}
          </ul>
        </div>
      </section>
    )
  }

  if (!summary) {
    return (
      <section className="admin-day-summary" aria-label="Сводка дня клуба">
        <div className="os-empty-card u-col u-items-center" role="alert">
          <p className="os-empty-card__title">Сводка дня не загрузилась</p>
          <p className="os-empty-card__hint">Нажмите «Повторить». Не помогло — синхронизируйте кнопкой в шапке.</p>
          {onRetry ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              Повторить
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section
      className="admin-day-summary admin-day-summary--dense"
      aria-label="Сводка дня клуба"
      aria-busy={loading || undefined}
    >
      {groups.map((g) => (
        <div key={g.id} className={`admin-day-summary__section admin-day-summary__section--${g.id}`}>
          <div className="admin-day-summary__section-head">
            <h3 className="admin-day-summary__section-title">{g.title}</h3>
            {g.id === 'base' && actionableUi > 0 ? (
              <p className="admin-day-summary__hint muted">
                {actionableUi}{' '}
                {actionableUi === 1 ? 'пункт' : actionableUi < 5 ? 'пункта' : 'пунктов'} требуют внимания
              </p>
            ) : null}
          </div>
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
