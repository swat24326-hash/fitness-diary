/**
 * Тренд клубной посещаемости: текущие N дн. vs предыдущие N дн.
 * Не зависит от фильтра месяца сводки.
 */

import { addDaysToIso } from '../dateRu.js'
import { ATTENDANCE_GLANCE_WINDOW_DAYS } from '../clientAttendanceGlanceCore.js'
import { aggregateClubAttendance } from './clubAttendanceAggCore.js'

/**
 * @param {ReturnType<typeof aggregateClubAttendance>} current
 * @param {Parameters<typeof aggregateClubAttendance>[0]} [input]
 */
export function attachClubAttendancePreviousWindow(current, input = {}) {
  if (!current?.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(String(current.asOf))) {
    return {
      ...current,
      previousWindow: null,
      deltaAvgVisitsPerWeek: null,
    }
  }
  const days =
    Number(current.windowDays) > 0
      ? Math.floor(Number(current.windowDays))
      : ATTENDANCE_GLANCE_WINDOW_DAYS
  const prevAsOf = addDaysToIso(current.asOf, -days)
  const previous = aggregateClubAttendance({
    ...input,
    dateTo: prevAsOf,
    clampAsOf: false,
    windowDays: days,
  })
  const cur = current.avgVisitsPerWeek
  const prev = previous.avgVisitsPerWeek
  const delta =
    Number.isFinite(cur) && Number.isFinite(prev)
      ? Math.round((Number(cur) - Number(prev)) * 100) / 100
      : null
  return {
    ...current,
    previousWindow: {
      asOf: previous.asOf,
      windowFrom: previous.windowFrom,
      windowDays: previous.windowDays,
      avgVisitsPerWeek: previous.avgVisitsPerWeek,
      inRhythmPct: previous.inRhythmPct,
      poolSize: previous.poolSize,
      totalVisitsInWindow: previous.totalVisitsInWindow,
    },
    deltaAvgVisitsPerWeek: delta,
  }
}

/**
 * Подпись дельты для UI: «было 1.40 · −0.15».
 * @param {number|null|undefined} previousAvg
 * @param {number|null|undefined} delta
 * @param {(n: number|null|undefined) => string} formatAvg
 */
export function formatClubAttendanceTrendHint(previousAvg, delta, formatAvg) {
  if (!Number.isFinite(previousAvg) || typeof formatAvg !== 'function') return null
  const prevLabel = formatAvg(previousAvg)
  if (!Number.isFinite(delta)) return `было ${prevLabel}`
  const sign = delta > 0 ? '+' : ''
  return `было ${prevLabel} · ${sign}${Number(delta).toFixed(2)}`
}
