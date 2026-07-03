import { monthDateRange, planProgressPercent } from './salesReportCore.js'

/** @param {number} year @param {number} month 1–12 */
export function reportDateForMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  const today = new Date()
  const lastDay = new Date(y, m, 0).getDate()
  const isCurrent =
    today.getFullYear() === y && today.getMonth() + 1 === m
  const day = isCurrent ? today.getDate() : lastDay
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate()
}

/**
 * @param {{
 *   monthSummary?: { profitTotal?: number, dayCount?: number } | null,
 *   plan?: { plan_total?: number } | null,
 *   fitCityTypeStats?: { totalCounted?: number } | null,
 * } | null} bundle
 * @param {number} year
 * @param {number} month
 */
export function buildGeminiPanelKpi(bundle, year, month) {
  if (!bundle) return null
  const summary = bundle.monthSummary ?? {}
  const profitTotal = Number(summary.profitTotal) || 0
  const dayCount = Number(summary.dayCount) || 0
  const planTotal = Number(bundle.plan?.plan_total) || 0
  const planPct = planProgressPercent(profitTotal, planTotal)
  const fitCity = Number(bundle.fitCityTypeStats?.totalCounted) || 0
  const monthDays = daysInMonth(year, month)

  return {
    profitTotal,
    planTotal,
    planPct,
    planFillPercent: Math.min(100, Math.max(0, planPct)),
    fitCity,
    reportsLabel: `${dayCount}/${monthDays}`,
    hasPlan: planTotal > 0,
  }
}

export function monthDateRangeIso(year, month) {
  return monthDateRange(Number(year), Number(month))
}
