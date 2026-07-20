import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, ChevronDown, ChevronUp, Clock, Gauge, TrendingUp, UserX } from 'lucide-react'
import { formatIsoRu } from '../../lib/period'
import {
  buildAdminDaySummaryCards,
  splitDaySummarySpotlight,
} from '../../lib/admin/adminDaySummaryUiCore.js'

const ICONS = {
  userX: UserX,
  clock: Clock,
  barChart: BarChart3,
  trending: TrendingUp,
  gauge: Gauge,
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
  const [expanded, setExpanded] = useState(false)

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

  const { spotlight, rest, hasMore } = useMemo(
    () => splitDaySummarySpotlight(cards, { maxSpotlight: 2 }),
    [cards],
  )

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

  const visible = expanded || !hasMore ? cards : spotlight

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
        {summary.actionable === 0 ? (
          <p className="admin-day-summary__ok muted">На сегодня ({formatIsoRu(summary.today)}) всё в порядке.</p>
        ) : (
          <p className="admin-day-summary__hint muted">
            {summary.actionable}{' '}
            {summary.actionable === 1 ? 'пункт' : summary.actionable < 5 ? 'пункта' : 'пунктов'} требуют внимания
          </p>
        )}
      </div>
      <ul className={`admin-day-summary__grid${expanded ? ' admin-day-summary__grid--expanded' : ''}`}>
        {visible.map(({ key, count, label, hint, icon, to, hot, warn, textCount, valueSuffix }) => {
          const Icon = ICONS[icon] || BarChart3
          return (
            <li key={key}>
              <Link
                to={to}
                className={`admin-day-summary__card u-no-decoration${hot ? ' admin-day-summary__card--hot' : ''}${warn ? ' admin-day-summary__card--warn' : ''}`}
              >
                <span className="admin-day-summary__card-icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <span
                  className={`admin-day-summary__card-count${textCount ? ' admin-day-summary__card-count--text' : ''}`}
                >
                  {count}
                  {valueSuffix ? <span className="admin-day-summary__card-suffix">{valueSuffix}</span> : null}
                </span>
                <span className="admin-day-summary__card-label">{label}</span>
                <span className="admin-day-summary__card-hint muted">{hint}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      {hasMore ? (
        <button
          type="button"
          className="admin-day-summary__more btn btn-ghost btn-sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp size={16} aria-hidden /> Свернуть
            </>
          ) : (
            <>
              <ChevronDown size={16} aria-hidden /> Ещё {rest.length}
            </>
          )}
        </button>
      ) : null}
      {summary.draftsToday > 0 ? (
        <p className="admin-day-summary__note muted">
          <AlertTriangle size={14} aria-hidden /> Черновиков тренировок сегодня: {summary.draftsToday}
        </p>
      ) : null}
    </section>
  )
}
