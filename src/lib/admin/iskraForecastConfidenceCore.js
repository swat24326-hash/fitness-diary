/**
 * Прогноз месяца с оценкой доверия (admin).
 */

import { formatPctPlain } from './iskraReplyPhrasing.js'

/**
 * @param {object | null | undefined} snapshot
 * @returns {{ line: string, confidence: 'high'|'medium'|'low', planPctForecast: number | null } | null}
 */
export function buildForecastConfidenceLine(snapshot) {
  if (!snapshot) return null
  const cf = snapshot.club_finance
  const mf = snapshot.month_forecast
  const forecastPct = Number(cf?.forecast?.plan_pct ?? mf?.forecast_plan_pct)
  if (!Number.isFinite(forecastPct)) return null

  const coverage = Number(snapshot.sales?.report_coverage_pct)
  const reportDays = Number(snapshot.sales?.days_with_reports) || 0
  const cal = snapshot.calendar_context ?? {}
  const daysElapsed = Number(cal.days_elapsed ?? cal.day_of_month) || 0
  const daysInMonth = Number(cal.days_in_month) || 30

  let confidence = 'medium'
  if (reportDays >= Math.max(5, Math.floor(daysInMonth * 0.25)) && coverage >= 50 && daysElapsed >= 7) {
    confidence = 'high'
  } else if (reportDays === 0 || coverage < 20 || daysElapsed < 3) {
    confidence = 'low'
  }

  const confRu = confidence === 'high' ? 'высокая' : confidence === 'low' ? 'низкая' : 'средняя'
  const line = `Прогноз плана к концу месяца — ${formatPctPlain(forecastPct)}% (доверие: ${confRu})`

  return { line, confidence, planPctForecast: forecastPct }
}
