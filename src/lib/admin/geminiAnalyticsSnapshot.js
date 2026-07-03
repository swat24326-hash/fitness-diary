/** Snapshot для Gemini-аналитика (без PII, только агрегаты). */

import {
  aggregateMonthFromDailyRows,
  computeNetProfit,
  monthDateRange,
  planProgressPercent,
  SALES_MATRIX_KEYS,
} from './salesReportCore.js'
import { computeNetProfitWithPayroll } from './trainerPayrollCore.js'

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
 * @param {{
 *   year: number,
 *   month: number,
 *   monthRows: object[],
 *   plan: object | null,
 *   expenseAmount?: number,
 *   payrollClubTotal?: number,
 *   includeFinance?: boolean,
 *   manualTrainingsTotal?: number,
 *   fitCityCompleted?: number,
 *   inactiveInPeriod?: number,
 *   trainingCompleted?: number,
 *   trainingDraft?: number,
 * }} opts
 */
export function buildGeminiSnapshot(opts) {
  const year = Number(opts.year)
  const month = Number(opts.month)
  const monthRows = opts.monthRows ?? []
  const summary = aggregateMonthFromDailyRows(monthRows)
  const planTotal = Number(opts.plan?.plan_total) || 0
  const progressPct = planProgressPercent(summary.profitTotal, planTotal)
  const matrix = sumMatrixTotalsFromDailyRows(monthRows)
  const manualTrainings = Number(opts.manualTrainingsTotal ?? summary.trainingsTotal) || 0
  const fitCity = Number(opts.fitCityCompleted) || 0
  const expense = Number(opts.expenseAmount) || 0
  const payroll = Number(opts.payrollClubTotal) || 0
  const includeFinance = opts.includeFinance !== false

  const avgDay = summary.dayCount > 0
    ? Math.round((summary.profitTotal / summary.dayCount) * 100) / 100
    : 0

  const snapshot = {
    club_name: String(opts.clubName ?? '').trim() || 'клуб',
    period: {
      year,
      month,
      label: periodLabelRu(year, month),
      from: monthDateRange(year, month).start,
      to: monthDateRange(year, month).end,
    },
    sales: {
      days_with_reports: summary.dayCount,
      profit_total: summary.profitTotal,
      profit_nk: summary.profitNk,
      profit_dk: summary.profitDk,
      profit_uk: summary.profitUk,
      avg_profit_per_report_day: avgDay,
      manual_trainings_total: manualTrainings,
      matrix_pz: matrix.pz,
      matrix_tz: matrix.tz,
      matrix_az: matrix.az,
      matrix_all: matrix.all,
      plan_total: planTotal,
      plan_pz: Number(opts.plan?.plan_pz) || 0,
      plan_tz: Number(opts.plan?.plan_tz) || 0,
      plan_az: Number(opts.plan?.plan_az) || 0,
      plan_progress_pct: progressPct,
    },
    operations: {
      fit_city_completed_trainings: fitCity,
      manual_vs_fit_city_gap: manualTrainings - fitCity,
      inactive_clients_in_period: Number(opts.inactiveInPeriod) || 0,
      completed_trainings_in_period: Number(opts.trainingCompleted) || 0,
      draft_trainings_in_period: Number(opts.trainingDraft) || 0,
    },
  }

  if (includeFinance) {
    snapshot.finance = {
      supervisor_expense: expense,
      trainer_payroll: payroll,
      net_profit: computeNetProfitWithPayroll(summary.profitTotal, payroll, expense),
      gross_before_expense: summary.profitTotal,
      net_without_payroll: computeNetProfit(summary.profitTotal, expense),
    }
  }

  return snapshot
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
