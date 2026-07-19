import { Link } from 'react-router-dom'
import { AlertTriangle, BarChart3, Clock, TrendingUp, UserX } from 'lucide-react'
import { formatIsoRu } from '../../lib/period'
import { buildAdminClubQueryHref } from '../../lib/admin/adminClientQuickFilters'

/**
 * @param {{
 *   summary: {
 *     today: string,
 *     yesterday: string,
 *     inactive: number,
 *     expiring: number,
 *     trainingsToday: number,
 *     trainingsYesterday: number,
 *     draftsToday: number,
 *     salesReportFilled: boolean | null,
 *     actionable: number,
 *   } | null,
 *   clubId?: string,
 *   loading?: boolean,
 *   noClub?: boolean,
 * }} props
 */
export function AdminClubDaySummaryPanel({ summary, clubId = '', loading = false, noClub = false }) {
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
      <section className="admin-day-summary" aria-labelledby="admin-day-summary-title" aria-busy="true">
        <h2 id="admin-day-summary-title" className="admin-day-summary__title">
          Сводка дня клуба
        </h2>
        <div className="admin-path-loading" role="status">
          <span className="app-loading__ring app-loading__ring--sm" aria-hidden />
          <p className="admin-path-loading__text">Загрузка…</p>
        </div>
        <div className="admin-path-skeleton-grid" aria-hidden>
          <div className="admin-path-skeleton-tile" />
          <div className="admin-path-skeleton-tile" />
          <div className="admin-path-skeleton-tile" />
          <div className="admin-path-skeleton-tile" />
        </div>
      </section>
    )
  }

  if (!summary) return null

  const salesLabel =
    summary.salesReportFilled === null
      ? 'Нет облака'
      : summary.salesReportFilled
        ? 'Заполнен'
        : 'Не заполнен'

  const items = [
    {
      key: 'inactive',
      count: summary.inactive,
      label: 'Не активные',
      hint: 'на сегодня · список в статистике',
      icon: UserX,
      to: buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'today', panel: 'inactive' }),
      hot: summary.inactive > 0,
    },
    {
      key: 'expiring',
      count: summary.expiring,
      label: 'Истекает абонемент',
      hint: '≤ 3 дня',
      icon: Clock,
      to: buildAdminClubQueryHref('/admin/clients', { clubId, filter: 'expiring' }),
      hot: summary.expiring > 0,
    },
    {
      key: 'trainings',
      count: summary.trainingsToday,
      label: 'Тренировок сегодня',
      hint: `вчера: ${summary.trainingsYesterday}`,
      icon: BarChart3,
      to: buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'today', panel: 'journal' }),
      hot: false,
    },
    {
      key: 'sales',
      count: summary.salesReportFilled === false ? '!' : summary.salesReportFilled ? '✓' : '—',
      label: 'Отчёт продаж',
      hint: formatIsoRu(summary.today),
      icon: TrendingUp,
      to: buildAdminClubQueryHref('/admin/sales', { clubId }),
      hot: summary.salesReportFilled === false,
      textCount: true,
    },
  ]

  return (
    <section
      className="admin-day-summary"
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
      <ul className="admin-day-summary__grid">
        {items.map(({ key, count, label, hint, icon: Icon, to, hot, textCount }) => (
          <li key={key}>
            <Link
              to={to}
              className={`admin-day-summary__card u-no-decoration${hot ? ' admin-day-summary__card--hot' : ''}${key === 'sales' && summary.salesReportFilled === false ? ' admin-day-summary__card--warn' : ''}`}
            >
              <span className="admin-day-summary__card-icon" aria-hidden>
                <Icon size={18} />
              </span>
              <span className={`admin-day-summary__card-count${textCount ? ' admin-day-summary__card-count--text' : ''}`}>
                {count}
              </span>
              <span className="admin-day-summary__card-label">{label}</span>
              <span className="admin-day-summary__card-hint muted">
                {key === 'sales' ? `${hint} · ${salesLabel}` : hint}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {summary.draftsToday > 0 ? (
        <p className="admin-day-summary__note muted">
          <AlertTriangle size={14} aria-hidden /> Черновиков тренировок сегодня: {summary.draftsToday}
        </p>
      ) : null}
    </section>
  )
}
