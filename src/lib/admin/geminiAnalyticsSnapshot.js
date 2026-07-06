/** Snapshot для Gemini-аналитика (без PII, только агрегаты). */

import { SALES_MATRIX_KEYS, resolvePlanFactFromMonthSummary } from './salesReportCore.js'
import {
  aggregateTrainingsByMembershipTypes,
  buildDailyProfitSeries,
} from './salesManagerStatsAgg.js'
import {
  buildClubMonthAnalytics,
  MONTH_LABELS_RU,
  periodLabelRu,
  previousMonthParts,
} from './clubMonthAnalyticsCore.js'
import { compactTrainerContourForPrompt } from './geminiTrainerContour.js'

export { MONTH_LABELS_RU, periodLabelRu, previousMonthParts }

/** @param {Array<Record<string, unknown>>} rows */
export function sumMatrixTotalsFromDailyRows(rows) {
  const totals = { pz: 0, tz: 0, az: 0, all: 0 }
  for (const row of rows ?? []) {
    for (const key of SALES_MATRIX_KEYS) {
      const n = Math.trunc(Number(row[key]) || 0)
      totals.all += n
      if (key.startsWith('pz_')) totals.pz += n
      else if (key.startsWith('tz_')) totals.tz += n
      else if (key.startsWith('az_')) totals.az += n
    }
  }
  return totals
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {number} year
 * @param {number} month
 */
export function buildProfitDayHighlights(rows, year, month) {
  const series = buildDailyProfitSeries(rows, year, month)
  const reported = series.filter((d) => d.hasReport && d.profit != null)
  if (!reported.length) return null

  let best = reported[0]
  let worst = reported[0]
  for (const day of reported) {
    if (day.profit > best.profit) best = day
    if (day.profit < worst.profit) worst = day
  }

  return {
    best_day: { date: best.date, profit: best.profit },
    worst_reported_day: { date: worst.date, profit: worst.profit },
  }
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<{ id: string, code?: string }>} membershipTypes
 * @param {number} [limit]
 */
export function topTrainingsByCardType(rows, membershipTypes, limit = 5) {
  const stats = aggregateTrainingsByMembershipTypes(rows, membershipTypes)
  return (stats.byType ?? []).slice(0, limit).map((row) => ({
    code: row.code,
    count: row.count,
  }))
}

/**
 * @param {{
 *   year: number,
 *   month: number,
 *   monthRows: object[],
 *   plan: object | null,
 *   expenseAmount?: number,
 *   payrollClubTotal?: number,
 *   aerobicPayrollClubTotal?: number,
 *   includeFinance?: boolean,
 *   manualTrainingsTotal?: number,
 *   fitCityCompleted?: number,
 *   inactiveInPeriod?: number,
 *   trainingCompleted?: number,
 *   trainingDraft?: number,
 *   membershipTypes?: Array<{ id: string, code?: string }>,
 *   clubName?: string,
 * }} opts
 */
export function buildGeminiSnapshot(opts) {
  return buildClubMonthAnalytics({
    ...opts,
    clubName: opts.clubName,
  })
}

/** Урезанный snapshot для ИСКРА — sales_contour + trainer_contour раздельно. */
export function compactSnapshotForPrompt(snapshot, selectedTrainerId = null) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const sales = snapshot.sales ?? {}
  const insights = snapshot.insights ?? {}
  const summaryLike = {
    profitGrossTotal: sales.profit_gross_total,
    profitTotal: sales.profit_total,
  }
  return {
    club_name: snapshot.club_name,
    period: snapshot.period,
    calendar_context: snapshot.calendar_context ?? null,
    sales_contour: {
      days_with_reports: sales.days_with_reports,
      report_coverage_pct: sales.report_coverage_pct,
      profit_total: sales.profit_total,
      profit_gross_total: sales.profit_gross_total ?? resolvePlanFactFromMonthSummary(summaryLike),
      refunds_total: sales.refunds_total ?? 0,
      plan_fact_gross: sales.plan_fact_gross ?? resolvePlanFactFromMonthSummary(summaryLike),
      profit_nk: sales.profit_nk,
      profit_dk: sales.profit_dk,
      profit_uk: sales.profit_uk,
      pnk_total: sales.pnk_total,
      plan_total: sales.plan_total,
      plan_level_1: sales.plan_level_1,
      plan_level_2: sales.plan_level_2,
      plan_level_3: sales.plan_level_3,
      achieved_plan_level: sales.achieved_plan_level,
      plan_progress_pct: sales.plan_progress_pct,
      plan_direction_rub: sales.plan_direction_rub,
      matrix_counts_pz_tz_az: sales.matrix_counts_pz_tz_az,
      manual_trainings_total: sales.manual_trainings_total,
      pz_trainings_from_manager_reports: sales.pz_trainings_from_manager_reports,
      profit_day_highlights: sales.profit_day_highlights,
      trainings_by_card_type: sales.trainings_by_card_type,
      structure_shares: sales.structure_shares,
      direction_structure: sales.direction_structure,
      extra_sales_rub: sales.extra_sales_rub,
    },
    trainer_contour: compactTrainerContourForPrompt(snapshot.trainer_contour, selectedTrainerId),
    trainings: snapshot.trainings,
    insights: {
      plan: insights.plan,
      pnk: insights.pnk,
      structure: insights.structure,
      fitcity: insights.fitcity,
      issues: insights.issues,
      has_critical_issues: insights.has_critical_issues,
      top_issue: insights.top_issue,
      highlights: insights.highlights,
      report: insights.report,
      direction_plan: insights.direction_plan,
      finance: insights.finance,
      mom_comparison: insights.mom_comparison,
      payroll: insights.payroll,
    },
    finance: snapshot.finance
      ? {
          net_profit: snapshot.finance.net_profit,
          gross_before_expense: snapshot.finance.gross_before_expense,
          trainer_payroll: snapshot.finance.trainer_payroll,
          aerobic_payroll: snapshot.finance.aerobic_payroll,
          supervisor_expense: snapshot.finance.supervisor_expense,
        }
      : undefined,
    data_sources: snapshot.data_sources?.analysis_hints?.length
      ? { analysis_hints: snapshot.data_sources.analysis_hints }
      : undefined,
  }
}

/**
 * @param {Array<{ role?: string, content?: string }>} messages
 * @param {number} [maxTurns]
 */
export function trimChatHistory(messages, maxTurns = 10) {
  return (messages ?? [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content ?? '').trim())
    .slice(-maxTurns)
}
