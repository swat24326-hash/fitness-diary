import { addCalendarDaysIso } from '../dateRu.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * @param {unknown} iso
 * @param {number} days
 * @returns {string}
 */
export function addDaysIso(iso, days) {
  return addCalendarDaysIso(iso, days)
}

/**
 * Понедельник ISO-недели даты (пн–вс), гражданский YYYY-MM-DD через UTC.
 * @param {unknown} iso
 * @returns {string}
 */
export function mondayOf(iso) {
  const day = String(iso ?? '').slice(0, 10)
  if (!ISO.test(day)) return ''
  const [y, m, d] = day.split('-').map(Number)
  const utc = Date.UTC(y, m - 1, d)
  const dow = new Date(utc).getUTCDay()
  const back = dow === 0 ? 6 : dow - 1
  return addCalendarDaysIso(day, -back)
}

/**
 * @param {unknown} iso
 * @returns {string}
 */
export function sundayOf(iso) {
  const mon = mondayOf(iso)
  return mon ? addCalendarDaysIso(mon, 6) : ''
}

/**
 * Понедельники от fromMonday до toMonday включительно (шаг 7 дней).
 * @param {unknown} fromMonday
 * @param {unknown} toMonday
 * @returns {string[]}
 */
export function isoWeeksInclusive(fromMonday, toMonday) {
  const a = mondayOf(fromMonday)
  const b = mondayOf(toMonday)
  if (!a || !b || a > b) return []
  const out = []
  let cur = a
  while (cur <= b) {
    out.push(cur)
    cur = addCalendarDaysIso(cur, 7)
    if (!cur) break
  }
  return out
}
