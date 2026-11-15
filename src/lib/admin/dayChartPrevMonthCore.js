import { monthDateRange, monthPartsFromIso } from './salesReportCore.js'

/**
 * Предыдущий календарный месяц от year/month (1–12).
 * @param {number} year
 * @param {number} month
 */
export function previousCalendarMonthParts(year, month) {
  let y = Number(year)
  let m = Number(month) - 1
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null
  if (m < 1) {
    m = 12
    y -= 1
  }
  if (m < 1 || m > 12 || y < 1) return null
  return { year: y, month: m }
}

/**
 * Диапазон прошлого календарного месяца относительно любой даты ISO в текущем.
 * @param {string} iso
 * @returns {{ year: number, month: number, dateFrom: string, dateTo: string } | null}
 */
export function previousCalendarMonthRangeFromIso(iso) {
  const parts = monthPartsFromIso(iso)
  if (!parts) return null
  const prev = previousCalendarMonthParts(parts.year, parts.month)
  if (!prev) return null
  const { start, end } = monthDateRange(prev.year, prev.month)
  return { ...prev, dateFrom: start, dateTo: end }
}

/**
 * Значения прошлого месяца на ось текущего: день месяца 1↔1, 31↔31.
 * Дня нет в прошлом месяце (31 при 30 днях) → null.
 *
 * @param {string[]} currentDates ISO YYYY-MM-DD
 * @param {Array<{ date?: string }>|null|undefined} prevRows
 * @param {(row: object) => number|null} getValue
 * @param {{ missingAs?: number|null, prevLastDay?: number }} [opts]
 * @returns {Array<number|null>}
 */
export function alignPrevMonthValuesByDayOfMonth(currentDates, prevRows, getValue, opts = {}) {
  const missingAs = Object.prototype.hasOwnProperty.call(opts, 'missingAs') ? opts.missingAs : null
  const prevLastDay = Number(opts.prevLastDay) > 0 ? Number(opts.prevLastDay) : null
  /** @type {Map<number, number|null>} */
  const byDom = new Map()

  for (const row of Array.isArray(prevRows) ? prevRows : []) {
    const date = String(row?.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const dom = Number(date.slice(8, 10))
    if (!Number.isFinite(dom) || dom < 1) continue
    byDom.set(dom, getValue(row))
  }

  return (Array.isArray(currentDates) ? currentDates : []).map((iso) => {
    const date = String(iso ?? '').slice(0, 10)
    const dom = Number(date.slice(8, 10))
    if (!Number.isFinite(dom) || dom < 1) return null
    if (prevLastDay != null && dom > prevLastDay) return null
    if (!byDom.has(dom)) return missingAs
    return byDom.get(dom)
  })
}

/** Последний день месяца YYYY-MM из первой даты серии / диапазона. */
export function lastDayOfMonthFromIso(iso) {
  const parts = monthPartsFromIso(iso)
  if (!parts) return null
  return new Date(parts.year, parts.month, 0).getDate()
}
