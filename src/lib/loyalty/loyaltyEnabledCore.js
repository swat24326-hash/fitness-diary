import { addDaysIso, mondayOf } from './loyaltyWeekCore.js'

/**
 * @typedef {{ start: string, end: string | null }} LoyaltyEnabledInterval
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/

function dayIso(raw) {
  const s = String(raw ?? '').slice(0, 10)
  return ISO.test(s) ? s : ''
}

/**
 * @param {unknown} raw
 * @returns {LoyaltyEnabledInterval[]}
 */
export function normalizeEnabledIntervals(raw) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  for (const row of list) {
    const start = dayIso(row?.start)
    if (!start) continue
    const endRaw = row?.end
    const end = endRaw == null || endRaw === '' ? null : dayIso(endRaw)
    if (endRaw != null && endRaw !== '' && !end) continue
    if (end && end < start) continue
    out.push({ start, end })
  }
  out.sort((a, b) => a.start.localeCompare(b.start))
  return out
}

/**
 * @param {unknown} iso
 * @param {unknown} intervals
 */
export function isDateEnabled(iso, intervals) {
  const day = dayIso(iso)
  if (!day) return false
  for (const iv of normalizeEnabledIntervals(intervals)) {
    if (day < iv.start) continue
    if (iv.end == null || day <= iv.end) return true
  }
  return false
}

/**
 * Все 7 дней недели (от понедельника) покрыты интервалами.
 * @param {unknown} monday
 * @param {unknown} intervals
 */
export function weekFullyEnabled(monday, intervals) {
  const mon = mondayOf(monday)
  if (!mon) return false
  const iv = normalizeEnabledIntervals(intervals)
  for (let i = 0; i < 7; i += 1) {
    const d = addDaysIso(mon, i)
    if (!isDateEnabled(d, iv)) return false
  }
  return true
}

/**
 * @param {unknown} intervals
 * @param {{ enabled?: boolean, as_of?: string }} opts
 * @returns {LoyaltyEnabledInterval[]}
 */
export function applyProgramToggle(intervals, opts = {}) {
  const day = dayIso(opts.as_of)
  const list = normalizeEnabledIntervals(intervals)
  const on = opts.enabled === true
  if (!day) return list

  const last = list[list.length - 1] ?? null

  if (on) {
    if (!last) return [{ start: day, end: null }]
    if (last.end == null) return list
    if (last.end === day) {
      const next = list.slice(0, -1)
      next.push({ start: last.start, end: null })
      return next
    }
    return [...list, { start: day, end: null }]
  }

  if (!last || last.end != null) return list
  const next = list.slice(0, -1)
  next.push({ start: last.start, end: day })
  return next
}
