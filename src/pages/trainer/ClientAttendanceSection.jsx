import { useMemo } from 'react'
import { ClientAttendanceAssessmentPanel } from '../../components/ClientAttendanceAssessmentPanel'
import { ClientAttendanceChart } from '../../components/ClientAttendanceChart'
import { buildClientAttendanceAssessment } from '../../lib/clientAttendanceAssessmentCore'
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
import { formatDateRu, todayLocalIso } from '../../lib/dateRu'

import { pickUsableTypedMembershipForDate } from '../../lib/membershipRules'

/**
 * @param {{
 *   trainings: object[],
 *   dateFrom: string,
 *   dateTo: string,
 *   online: boolean,
 *   ensureOk: boolean,
 *   membershipStartDates?: string[],
 *   memberships?: object[],
 *   membershipTypes?: object[],
 *   todayIso?: string,
 *   audience?: 'trainer' | 'sales' | 'staff',
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
  memberships = [],
  membershipTypes = [],
  todayIso,
  audience = 'trainer',
  loading = false,
}) {
  const stats = useMemo(() => {
    const usable = pickUsableTypedMembershipForDate(memberships, dateTo)
    const memStart = String(usable?.start_date ?? '').slice(0, 10)
    const gapFrom = memStart && memStart > dateFrom ? memStart : dateFrom
    return buildClientAttendanceStats(trainings, { dateFrom, dateTo, gapFrom })
  }, [trainings, dateFrom, dateTo, memberships])

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

  const assessment = useMemo(
    () =>
      buildClientAttendanceAssessment(stats, {
        dateFrom,
        dateTo,
        todayIso: todayIso ?? todayLocalIso(),
        dataReliable: online !== false && ensureOk === true,
        coverageHint,
        audience,
        memberships,
        membershipTypes,
        allTrainings: trainings,
      }),
    [
      stats,
      dateFrom,
      dateTo,
      todayIso,
      online,
      ensureOk,
      coverageHint,
      audience,
      memberships,
      membershipTypes,
      trainings,
    ],
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
          <span className="stats-attendance-kpi__label">В периоде</span>
          <strong className="stats-attendance-kpi__value">
            {stats.summary.daysSinceLastVisit != null ? `${stats.summary.daysSinceLastVisit} дн.` : '—'}
          </strong>
        </div>
      </div>

      <ClientAttendanceAssessmentPanel assessment={assessment} />

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
