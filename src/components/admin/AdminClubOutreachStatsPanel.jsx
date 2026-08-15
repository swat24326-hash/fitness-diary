import { formatDateRu } from '../../lib/dateRu.js'
import '../../styles/club-call.css'

/**
 * Сводка по журналу (звонки или SMS): KPI + по дням + по сотрудникам.
 * @param {{
 *   stats: {
 *     total: number,
 *     ok: number,
 *     fail: number,
 *     unique_clients: number,
 *     by_day: Array<{ day: string, ok: number, fail: number, total: number }>,
 *     by_sender: Array<{ name: string, ok: number, fail: number, total: number }>,
 *   } | null,
 *   loading?: boolean,
 *   emptyHint?: string,
 *   okLabel?: string,
 * }} props
 */
export function AdminClubOutreachStatsPanel({
  stats,
  loading = false,
  emptyHint = 'Нет данных за период.',
  okLabel = 'Ушло',
}) {
  if (loading) {
    return <p className="muted">Считаем сводку…</p>
  }
  if (!stats || stats.total === 0) {
    return <p className="muted club-call-stats__empty">{emptyHint}</p>
  }

  return (
    <div className="club-call-stats">
      <div className="club-call-stats__kpis" role="group" aria-label="Итоги">
        <div className="club-call-stats__kpi">
          <span className="club-call-stats__kpi-val">{stats.total}</span>
          <span className="club-call-stats__kpi-lab">Всего</span>
        </div>
        <div className="club-call-stats__kpi club-call-stats__kpi--ok">
          <span className="club-call-stats__kpi-val">{stats.ok}</span>
          <span className="club-call-stats__kpi-lab">{okLabel}</span>
        </div>
        <div className="club-call-stats__kpi club-call-stats__kpi--fail">
          <span className="club-call-stats__kpi-val">{stats.fail}</span>
          <span className="club-call-stats__kpi-lab">Ошибки</span>
        </div>
        <div className="club-call-stats__kpi">
          <span className="club-call-stats__kpi-val">{stats.unique_clients}</span>
          <span className="club-call-stats__kpi-lab">Клиентов</span>
        </div>
      </div>

      <h3 className="club-call-stats__h">По дням</h3>
      <ul className="club-call-stats__table">
        {stats.by_day.map((row) => (
          <li key={row.day} className="club-call-stats__row">
            <span className="club-call-stats__row-name">{formatDateRu(row.day)}</span>
            <span className="club-call-stats__row-nums muted">
              {row.total} · {okLabel.toLowerCase()} {row.ok} · ош. {row.fail}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="club-call-stats__h">По сотрудникам</h3>
      {stats.by_sender.length === 0 ? (
        <p className="muted">Нет данных по сотрудникам.</p>
      ) : (
        <ul className="club-call-stats__table">
          {stats.by_sender.map((row) => (
            <li key={row.key || row.name} className="club-call-stats__row">
              <span className="club-call-stats__row-name">{row.name}</span>
              <span className="club-call-stats__row-nums muted">
                {row.total} · {okLabel.toLowerCase()} {row.ok} · ош. {row.fail}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="muted club-call-stats__note">
        Это учёт команд из Оси (успех / сбой API). Для звонков с исходами смотрите вкладку «Сводка» в журнале.
      </p>
    </div>
  )
}
