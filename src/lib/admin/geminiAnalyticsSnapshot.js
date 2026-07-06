/** Snapshot для Gemini-аналитика (без PII, только агрегаты). */

import {
  aggregateMonthFromDailyRows,
  computeNetProfit,
  monthDateRange,
  planProgressPercent,
  readPlanLevels,
  resolveAchievedPlanLevel,
  resolvePlanTotal,
  SALES_MATRIX_KEYS,
} from './salesReportCore.js'
import {
  aggregateTrainingsByMembershipTypes,
  buildDailyProfitSeries,
  sumPnkFromDailyRows,
} from './salesManagerStatsAgg.js'
import { computeNetProfitWithPayroll } from './trainerPayrollCore.js'
import { buildGeminiDataSourcesMeta } from './geminiAnalyticsDomain.js'

export const MONTH_LABELS_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

/** @param {number} year @param {number} month 1–12 */
export function previousMonthParts(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null
  if (m <= 1) return { year: y - 1, month: 12 }
  return { year: y, month: m - 1 }
}

export function periodLabelRu(year, month) {
  const m = Number(month)
  const name = MONTH_LABELS_RU[(m || 1) - 1] ?? ''
  return `${name} ${Number(year) || ''}`.trim()
}

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
 * }} opts
 */
export function buildGeminiSnapshot(opts) {
  const year = Number(opts.year)
  const month = Number(opts.month)
  const monthRows = opts.monthRows ?? []
  const summary = aggregateMonthFromDailyRows(monthRows)
  const planLevels = readPlanLevels(opts.plan)
  const planTotal = resolvePlanTotal(opts.plan)
  const progressPct = planProgressPercent(summary.profitTotal, planTotal)
  const achievedPlanLevel = resolveAchievedPlanLevel(summary.profitTotal, planLevels)
  const matrix = sumMatrixTotalsFromDailyRows(monthRows)
  const pnkTotal = sumPnkFromDailyRows(monthRows)
  const manualTrainings = Number(opts.manualTrainingsTotal ?? summary.trainingsTotal) || 0
  const fitCity = Number(opts.fitCityCompleted) || 0
  const expense = Number(opts.expenseAmount) || 0
  const payroll = Number(opts.payrollClubTotal) || 0
  const aerobicPayroll = Number(opts.aerobicPayrollClubTotal) || 0
  const includeFinance = opts.includeFinance !== false
  const membershipTypes = opts.membershipTypes ?? []

  const avgDay = summary.dayCount > 0
    ? Math.round((summary.profitTotal / summary.dayCount) * 100) / 100
    : 0
  const daysInMonth = new Date(year, month, 0).getDate()
  const reportCoveragePct =
    daysInMonth > 0 ? Math.round((summary.dayCount / daysInMonth) * 1000) / 10 : 0
  const trainingsGap = manualTrainings - fitCity
  const profitDayHighlights = buildProfitDayHighlights(monthRows, year, month)
  const trainingsByCardType = topTrainingsByCardType(monthRows, membershipTypes, 5)

  const snapshot = {
    club_name: String(opts.clubName ?? '').trim() || 'клуб',
    period: {
      year,
      month,
      label: periodLabelRu(year, month),
      from: monthDateRange(year, month).start,
      to: monthDateRange(year, month).end,
      days_in_month: daysInMonth,
    },
    sales: {
      days_with_reports: summary.dayCount,
      report_coverage_pct: reportCoveragePct,
      profit_total: summary.profitTotal,
      profit_nk: summary.profitNk,
      profit_dk: summary.profitDk,
      profit_uk: summary.profitUk,
      avg_profit_per_report_day: avgDay,
      pnk_total: pnkTotal,
      manual_trainings_total: manualTrainings,
      matrix_counts_pz_tz_az: {
        pz: matrix.pz,
        tz: matrix.tz,
        az: matrix.az,
        all: matrix.all,
      },
      plan_total: planTotal,
      plan_level_1: planLevels.level1,
      plan_level_2: planLevels.level2,
      plan_level_3: planLevels.level3,
      achieved_plan_level: achievedPlanLevel,
      plan_direction_rub: {
        pz: Number(opts.plan?.plan_pz) || 0,
        tz: Number(opts.plan?.plan_tz) || 0,
        az: Number(opts.plan?.plan_az) || 0,
      },
      plan_progress_pct: progressPct,
      profit_day_highlights: profitDayHighlights,
      trainings_by_card_type: trainingsByCardType,
    },
    trainings: {
      manager_report_total: manualTrainings,
      fit_city_tablets_only: fitCity,
      gap_manager_minus_fit_city: trainingsGap,
    },
    operations: {
      fit_city_completed_trainings: fitCity,
      manual_vs_fit_city_gap: trainingsGap,
      inactive_clients_in_period: Number(opts.inactiveInPeriod) || 0,
      completed_trainings_in_period: Number(opts.trainingCompleted) || 0,
      draft_trainings_in_period: Number(opts.trainingDraft) || 0,
    },
    data_sources: buildGeminiDataSourcesMeta({
      managerReportTotal: manualTrainings,
      fitCityTotal: fitCity,
      dayCount: summary.dayCount,
      daysInMonth,
    }),
  }

  if (includeFinance) {
    snapshot.finance = {
      supervisor_expense: expense,
      trainer_payroll: payroll,
      aerobic_payroll: aerobicPayroll,
      net_profit: computeNetProfitWithPayroll(summary.profitTotal, payroll, expense, aerobicPayroll),
      gross_before_expense: summary.profitTotal,
      net_without_payroll: computeNetProfit(summary.profitTotal, expense),
    }
  }

  return snapshot
}

/** Урезанный snapshot для Gemini — ключевые поля без шума. */
export function compactSnapshotForPrompt(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const sales = snapshot.sales ?? {}
  const compact = {
    club_name: snapshot.club_name,
    period: snapshot.period,
    sales: {
      days_with_reports: sales.days_with_reports,
      report_coverage_pct: sales.report_coverage_pct,
      profit_total: sales.profit_total,
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
      profit_day_highlights: sales.profit_day_highlights,
      trainings_by_card_type: sales.trainings_by_card_type,
    },
    trainings: snapshot.trainings,
  }
  if (snapshot.finance) {
    compact.finance = {
      net_profit: snapshot.finance.net_profit,
      trainer_payroll: snapshot.finance.trainer_payroll,
    }
  }
  if (snapshot.data_sources?.analysis_hints?.length) {
    compact.data_sources = { analysis_hints: snapshot.data_sources.analysis_hints }
  }
  return compact
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
