import {
  averageCompleted,
  formatDayAxisLabel,
  isWeekendIsoDate,
} from './adminClubDayChartCore.js'
import {
  alignPrevMonthValuesByDayOfMonth,
  lastDayOfMonthFromIso,
  previousCalendarMonthRangeFromIso,
} from './dayChartPrevMonthCore.js'

/**
 * Две серии менеджера (ПНК + тренировки) → один график как у админа.
 * Дни без отчёта → null (разрыв линии). Прошлый месяц — по дню месяца.
 *
 * @param {Array<{ date?: string, value?: number | null, hasReport?: boolean }>|null|undefined} pnkSeries
 * @param {Array<{ date?: string, value?: number | null, hasReport?: boolean }>|null|undefined} trainingsSeries
 * @param {{
 *   todayIso?: string,
 *   prevPnkSeries?: Array<{ date?: string, value?: number | null, hasReport?: boolean }>|null,
 *   prevTrainingsSeries?: Array<{ date?: string, value?: number | null, hasReport?: boolean }>|null,
 * }} [opts]
 */
export function buildSalesManagerDayChartSeries(pnkSeries, trainingsSeries, opts = {}) {
  const todayIso = String(opts.todayIso ?? '').slice(0, 10)
  const byDate = new Map()

  for (const row of Array.isArray(pnkSeries) ? pnkSeries : []) {
    const date = String(row?.date ?? '').slice(0, 10)
    if (!date) continue
    const cur = byDate.get(date) || emptyDay(date)
    cur.hasReport = cur.hasReport || Boolean(row?.hasReport)
    cur.pnk = row?.hasReport ? Math.max(0, Number(row?.value ?? 0) || 0) : null
    byDate.set(date, cur)
  }

  for (const row of Array.isArray(trainingsSeries) ? trainingsSeries : []) {
    const date = String(row?.date ?? '').slice(0, 10)
    if (!date) continue
    const cur = byDate.get(date) || emptyDay(date)
    cur.hasReport = cur.hasReport || Boolean(row?.hasReport)
    cur.trainings = row?.hasReport ? Math.max(0, Number(row?.value ?? 0) || 0) : null
    byDate.set(date, cur)
  }

  // Текущий месяц — ось только до сегодня (как у админа), без пустого хвоста.
  const dates = trimSalesDayChartDatesToToday([...byDate.keys()].sort(), todayIso)
  /** @type {string[]} */
  const labels = []
  /** @type {Array<number|null>} */
  const pnk = []
  /** @type {Array<number|null>} */
  const trainings = []
  /** @type {boolean[]} */
  const hasReport = []
  /** @type {Array<{ weekend: boolean, today: boolean }>} */
  const dayFlags = []

  for (const date of dates) {
    const row = byDate.get(date)
    labels.push(formatDayAxisLabel(date))
    pnk.push(row.hasReport ? Number(row.pnk ?? 0) || 0 : null)
    trainings.push(row.hasReport ? Number(row.trainings ?? 0) || 0 : null)
    hasReport.push(Boolean(row.hasReport))
    dayFlags.push({
      weekend: isWeekendIsoDate(date),
      today: Boolean(todayIso) && date === todayIso,
    })
  }

  const reportedTrainings = trainings.filter((n) => n != null).map((n) => Number(n) || 0)
  const reportedPnk = pnk.filter((n) => n != null).map((n) => Number(n) || 0)

  const prevRange = dates.length ? previousCalendarMonthRangeFromIso(dates[0]) : null
  const prevLastDay = prevRange ? lastDayOfMonthFromIso(prevRange.dateFrom) : null
  const alignOpts = { missingAs: null, prevLastDay }

  const prevTrainings = Array.isArray(opts.prevTrainingsSeries)
    ? alignPrevMonthValuesByDayOfMonth(
        dates,
        opts.prevTrainingsSeries,
        (r) => (r?.hasReport ? Math.max(0, Number(r?.value ?? 0) || 0) : null),
        alignOpts,
      )
    : null

  const prevPnk = Array.isArray(opts.prevPnkSeries)
    ? alignPrevMonthValuesByDayOfMonth(
        dates,
        opts.prevPnkSeries,
        (r) => (r?.hasReport ? Math.max(0, Number(r?.value ?? 0) || 0) : null),
        alignOpts,
      )
    : null

  return {
    labels,
    dates,
    pnk,
    trainings,
    prevPnk,
    prevTrainings,
    hasReport,
    dayFlags,
    avgTrainings: averageCompleted(reportedTrainings),
    avgPnk: averageCompleted(reportedPnk),
    reportCount: reportedTrainings.length,
    hasPrevMonth:
      (Array.isArray(prevTrainings) && prevTrainings.some((n) => n != null)) ||
      (Array.isArray(prevPnk) && prevPnk.some((n) => n != null)),
    pointCount: labels.length,
  }
}

function emptyDay(date) {
  return { date, hasReport: false, pnk: null, trainings: null }
}

/**
 * В текущем календарном месяце оставляем дни с 1-го по сегодня включительно.
 * Прошлый / будущий месяц не режем.
 * @param {string[]} dates
 * @param {string} todayIso
 */
export function trimSalesDayChartDatesToToday(dates, todayIso) {
  const list = Array.isArray(dates) ? dates : []
  const today = String(todayIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !list.length) return list
  const monthKey = today.slice(0, 7)
  const first = String(list[0] ?? '').slice(0, 10)
  if (first.slice(0, 7) !== monthKey) return list
  return list.filter((d) => String(d).slice(0, 10) <= today)
}
