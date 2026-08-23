import { useMemo } from 'react'
import { ClientAttendanceChart } from '../../components/ClientAttendanceChart'
import {
  ATTENDANCE_MISSED_LABEL_RU,
  buildClientAttendanceStats,
  formatAttendanceBucketDatesCellRu,
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

  const periodRows = useMemo(() => [...stats.buckets].reverse(), [stats.buckets])

  const bucketKindLabel = stats.bucketKind === 'month' ? 'по месяцам' : 'по неделям'
  const periodColLabel = stats.bucketKind === 'month' ? 'Месяц' : 'Неделя'
  const missedPeriods = stats.buckets.filter((b) => !b.visited).length
  const periodUnit = stats.bucketKind === 'month' ? 'месяцев' : 'недель'

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
        Завершённые тренировки из дневника (все типы, включая БЗ). На графике и в таблице —{' '}
        <strong>все</strong> {stats.bucketKind === 'month' ? 'месяцы' : 'недели'} выбранного периода;
        {missedPeriods > 0 ? ` без визитов: ${missedPeriods} ${periodUnit}.` : ' '}
        Пустой период — «{ATTENDANCE_MISSED_LABEL_RU}». Группировка {bucketKindLabel}
        {stats.bucketKind === 'month' ? ' (длинный диапазон — больше полугода)' : ''}.
      </p>

      {stats.buckets.length > 0 ? (
        <div className="stats-chart-shell">
          <ClientAttendanceChart buckets={stats.buckets} bucketKind={stats.bucketKind} />
        </div>
      ) : (
        <p className="muted stats-attendance-empty">За выбранный период нет календарных интервалов.</p>
      )}

      {stats.summary.total === 0 && stats.buckets.length > 0 ? (
        <p className="muted stats-attendance-empty stats-attendance-empty--inline">
          За выбранный период завершённых тренировок нет — ниже все {stats.bucketKind === 'month' ? 'месяцы' : 'недели'}{' '}
          с пропусками.
        </p>
      ) : null}

      <h3 className="section-title stats-attendance-table-title">По периодам</h3>
      <div className="table-wrap stats-attendance-table">
        <table>
          <thead>
            <tr>
              <th className="stats-attendance-table__idx">№</th>
              <th>{periodColLabel}</th>
              <th>Тренировок</th>
              <th>Даты</th>
            </tr>
          </thead>
          <tbody>
            {periodRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  —
                </td>
              </tr>
            ) : (
              periodRows.map((b) => (
                <tr
                  key={`${b.start}:${b.end}`}
                  className={b.visited ? undefined : 'stats-attendance-table__row--missed'}
                >
                  <td className="stats-attendance-table__idx">{b.index}</td>
                  <td>{b.labelRu}</td>
                  <td>{b.count}</td>
                  <td>{formatAttendanceBucketDatesCellRu(b.dates, formatDateRu)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
