import { useMemo } from 'react'
import { ClientAttendanceChart } from '../../components/ClientAttendanceChart'
import {
  buildClientAttendanceStats,
  formatGroupedVisitDatesRu,
  listCompletedVisitDates,
} from '../../lib/clientAttendanceStatsCore'
import {
  earliestCompletedTrainingDate,
  resolveTrainingsCoverageHint,
} from '../../lib/clientTrainingsCoverageHint'
import { formatDateRu } from '../../lib/dateRu'

/**
 * @param {{
 *   trainings: object[],
 *   dateFrom: string,
 *   dateTo: string,
 *   online: boolean,
 *   ensureOk: boolean,
 *   membershipStartDates?: string[],
 *   loading?: boolean,
 * }} props
 */
export function ClientAttendanceSection({
  trainings,
  dateFrom,
  dateTo,
  online,
  ensureOk,
  membershipStartDates = [],
  loading = false,
}) {
  const stats = useMemo(
    () => buildClientAttendanceStats(trainings, { dateFrom, dateTo }),
    [trainings, dateFrom, dateTo],
  )

  const localCompletedCount = useMemo(() => listCompletedVisitDates(trainings).length, [trainings])

  const coverageHint = useMemo(
    () =>
      resolveTrainingsCoverageHint({
        online,
        ensureOk,
        earliestLocalCompletedDate: earliestCompletedTrainingDate(trainings),
        membershipStartDates,
        localCompletedCount,
      }),
    [online, ensureOk, trainings, membershipStartDates, localCompletedCount],
  )

  const tableBuckets = useMemo(
    () => stats.buckets.filter((b) => b.count > 0),
    [stats.buckets],
  )

  const chartBuckets = useMemo(() => {
    const nonzero = stats.buckets.filter((b) => b.count > 0)
    return nonzero.length ? nonzero : stats.buckets
  }, [stats.buckets])

  const bucketKindLabel = stats.bucketKind === 'month' ? 'по месяцам' : 'по неделям'

  if (loading) {
    return (
      <div className="stats-attendance" aria-busy="true" aria-label="Загрузка посещаемости">
        <p className="muted stats-attendance-loading">Загрузка дневника…</p>
      </div>
    )
  }

  return (
    <div className="stats-attendance">
      {coverageHint ? (
        <p className="stats-attendance-hint" role="status">
          {coverageHint}
        </p>
      ) : null}

      <div className="stats-attendance-kpi" aria-label="Сводка посещаемости">
        <div className="stats-attendance-kpi__tile">
          <span className="stats-attendance-kpi__label">Тренировок</span>
          <strong className="stats-attendance-kpi__value">{stats.summary.total}</strong>
        </div>
        <div className="stats-attendance-kpi__tile">
          <span className="stats-attendance-kpi__label">В неделю</span>
          <strong className="stats-attendance-kpi__value">{stats.summary.visitsPerWeek}</strong>
        </div>
        <div className="stats-attendance-kpi__tile">
          <span className="stats-attendance-kpi__label">Макс. перерыв</span>
          <strong className="stats-attendance-kpi__value">
            {stats.summary.maxGapDays != null ? `${stats.summary.maxGapDays} дн.` : '—'}
          </strong>
        </div>
        <div className="stats-attendance-kpi__tile">
          <span className="stats-attendance-kpi__label">С последнего</span>
          <strong className="stats-attendance-kpi__value">
            {stats.summary.daysSinceLastVisit != null ? `${stats.summary.daysSinceLastVisit} дн.` : '—'}
          </strong>
        </div>
        <div className="stats-attendance-kpi__tile stats-attendance-kpi__tile--rhythm">
          <span className="stats-attendance-kpi__label">Ритм</span>
          <span className={`stats-attendance-reg stats-attendance-reg--${stats.summary.regularity}`}>
            {stats.summary.regularityLabelRu}
          </span>
        </div>
      </div>

      <p className="muted stats-attendance-note">
        Завершённые тренировки из дневника (все типы, включая БЗ). Одна дата — несколько тренировок
        возможны. Группировка {bucketKindLabel}.
      </p>

      {stats.summary.total === 0 ? (
        <p className="muted stats-attendance-empty">За выбранный период завершённых тренировок нет.</p>
      ) : (
        <div className="stats-chart-shell">
          <ClientAttendanceChart buckets={chartBuckets} bucketKind={stats.bucketKind} />
        </div>
      )}

      <h3 className="section-title stats-attendance-table-title">По периодам</h3>
      <div className="table-wrap stats-attendance-table">
        <table>
          <thead>
            <tr>
              <th>{stats.bucketKind === 'month' ? 'Месяц' : 'Неделя'}</th>
              <th>Тренировок</th>
              <th>Даты</th>
            </tr>
          </thead>
          <tbody>
            {tableBuckets.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  —
                </td>
              </tr>
            ) : (
              tableBuckets
                .slice()
                .reverse()
                .map((b) => (
                  <tr key={`${b.start}:${b.end}`}>
                    <td>{b.labelRu}</td>
                    <td>{b.count}</td>
                    <td>{formatGroupedVisitDatesRu(b.dates, formatDateRu)}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
