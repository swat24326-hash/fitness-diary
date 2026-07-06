/** Агрегаты статистики менеджера по продажам (без React / IDB). */

import { aggregateAerobicPayrollFromDailyRows, buildAerobicPayRateMap } from './aerobicPayrollCore.js'
import { sumMatrixTotalsFromDailyRows } from './salesReportCore.js'
import { filterAerobicSalesTypes, filterTrainerAssignableTypes } from '../membershipTypesCore.js'
import { aggregatePayrollFromDailyRows, buildTrainerPayRateMap } from './trainerPayrollCore.js'
import {
  matrixRowsToMembershipStats,
  normalizeMatrixRowsFromDb,
  sumTypedMatrixRows,
} from './salesTrainingsMatrix.js'
import {
  aggregateMonthFromDailyRows,
  computeProfitDay,
  monthDateRange,
  planProgressPercent,
  resolveAchievedPlanLevel,
  resolvePlanFinalTarget,
  SALES_MATRIX_COLS,
  SALES_MATRIX_HALL_ROWS,
  sumDopRubFromDailyRows,
} from './salesReportCore.js'

/** @param {Array<Record<string, unknown>>} rows */
export function sumMatrix3x3FromDailyRows(rows) {
  /** @type {Record<string, number>} */
  const grid = {}
  for (const row of SALES_MATRIX_HALL_ROWS) {
    for (const col of SALES_MATRIX_COLS) {
      grid[`${row.key}_${col.suffix}`] = 0
    }
  }
  for (const r of rows ?? []) {
    for (const key of Object.keys(grid)) {
      grid[key] += Math.trunc(Number(r[key]) || 0)
    }
  }
  return grid
}

/** @param {Array<Record<string, unknown>>} rows */
export function sumPnkFromDailyRows(rows) {
  let total = 0
  for (const r of rows ?? []) {
    total += Math.trunc(Number(r.pnk_total) || 0)
  }
  return total
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {number} year
 * @param {number} month 1–12
 */
export function buildDailyProfitSeries(rows, year, month) {
  const y = Number(year)
  const m = Number(month)
  const lastDay = new Date(y, m, 0).getDate()
  /** @type {Map<string, number>} */
  const byDate = new Map()
  for (const r of rows ?? []) {
    const iso = String(r.report_date ?? '').slice(0, 10)
    if (!iso) continue
    const nk = Number(r.profit_nk) || 0
    const dk = Number(r.profit_dk) || 0
    const uk = Number(r.profit_uk) || 0
    const profit = Number(r.profit_day) || computeProfitDay(nk, dk, uk)
    byDate.set(iso, Math.round(profit * 100) / 100)
  }

  /** @type {Array<{ date: string, profit: number | null, hasReport: boolean }>} */
  const series = []
  for (let day = 1; day <= lastDay; day += 1) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const hasReport = byDate.has(iso)
    series.push({
      date: iso,
      profit: hasReport ? byDate.get(iso) : null,
      hasReport,
    })
  }
  return series
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {number} year
 * @param {number} month 1–12
 * @param {'pnk_total' | 'trainings_count'} field
 */
export function buildDailyCountSeries(rows, year, month, field) {
  const y = Number(year)
  const m = Number(month)
  const lastDay = new Date(y, m, 0).getDate()
  /** @type {Map<string, number>} */
  const byDate = new Map()
  for (const r of rows ?? []) {
    const iso = String(r.report_date ?? '').slice(0, 10)
    if (!iso) continue
    byDate.set(iso, Math.trunc(Number(r[field]) || 0))
  }

  /** @type {Array<{ date: string, value: number | null, hasReport: boolean }>} */
  const series = []
  for (let day = 1; day <= lastDay; day += 1) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const hasReport = byDate.has(iso)
    series.push({
      date: iso,
      value: hasReport ? byDate.get(iso) : null,
      hasReport,
    })
  }
  return series
}

/** @param {Array<Record<string, unknown>>} rows */
export function mergeTrainingsMatrixFromDailyRows(rows) {
  const merged = []
  for (const r of rows ?? []) {
    merged.push(...normalizeMatrixRowsFromDb(r.trainings_matrix))
  }
  return merged
}

/** @param {Array<Record<string, unknown>>} rows @param {Array<{ id: string, code?: string }>} membershipTypes */
export function aggregateTrainingsByMembershipTypes(rows, membershipTypes) {
  const matrixRows = mergeTrainingsMatrixFromDailyRows(rows)
  return matrixRowsToMembershipStats(matrixRows, membershipTypes)
}

/** @param {Array<Record<string, unknown>>} rows */
export function buildSalesDayTableRows(rows) {
  return [...(rows ?? [])]
    .map((r) => {
      const date = String(r.report_date ?? '').slice(0, 10)
      const profitNk = Number(r.profit_nk) || 0
      const profitDk = Number(r.profit_dk) || 0
      const profitUk = Number(r.profit_uk) || 0
      const profitDay = Number(r.profit_day) || computeProfitDay(profitNk, profitDk, profitUk)
      return {
        date,
        profitNk: Math.round(profitNk * 100) / 100,
        profitDk: Math.round(profitDk * 100) / 100,
        profitUk: Math.round(profitUk * 100) / 100,
        profitDay: Math.round(profitDay * 100) / 100,
        trainings: Math.trunc(Number(r.trainings_count) || 0),
        pnk: Math.trunc(Number(r.pnk_total) || 0),
      }
    })
    .filter((row) => row.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * @param {{
 *   monthRows?: Array<Record<string, unknown>>,
 *   planLevels?: { level1?: number, level2?: number, level3?: number },
 *   membershipTypes?: Array<{ id: string, code?: string }>,
 *   year: number,
 *   month: number,
 * }} opts
 */
export function buildSalesManagerMonthStats(opts) {
  const monthRows = opts.monthRows ?? []
  const year = Number(opts.year)
  const month = Number(opts.month)
  const summary = aggregateMonthFromDailyRows(monthRows)
  const pnkTotal = sumPnkFromDailyRows(monthRows)
  const daysInMonth = new Date(year, month, 0).getDate()

  const planRow = {
    plan_level_1: opts.planLevels?.level1,
    plan_level_2: opts.planLevels?.level2,
    plan_level_3: opts.planLevels?.level3,
  }
  const finalTarget = resolvePlanFinalTarget(planRow)
  const achievedLevel = resolveAchievedPlanLevel(summary.profitTotal, {
    level1: Number(opts.planLevels?.level1) || 0,
    level2: Number(opts.planLevels?.level2) || 0,
    level3: Number(opts.planLevels?.level3) || 0,
  })
  const progressPercent = planProgressPercent(summary.profitTotal, finalTarget)

  const dailySeries = buildDailyProfitSeries(monthRows, year, month)
  const reportedProfits = dailySeries.filter((d) => d.profit != null).map((d) => d.profit)
  const maxDayProfit = reportedProfits.length ? Math.max(...reportedProfits) : 0

  const dailyPnkSeries = buildDailyCountSeries(monthRows, year, month, 'pnk_total')
  const reportedPnk = dailyPnkSeries.filter((d) => d.value != null).map((d) => d.value)
  const maxDayPnk = reportedPnk.length ? Math.max(...reportedPnk) : 0

  const dailyTrainingsSeries = buildDailyCountSeries(monthRows, year, month, 'trainings_count')
  const reportedTrainings = dailyTrainingsSeries.filter((d) => d.value != null).map((d) => d.value)
  const maxDayTrainings = reportedTrainings.length ? Math.max(...reportedTrainings) : 0

  const trainingsStats = aggregateTrainingsByMembershipTypes(monthRows, opts.membershipTypes ?? [])
  const trainingsTypedTotal = sumTypedMatrixRows(mergeTrainingsMatrixFromDailyRows(monthRows))

  const trainerTypes = filterTrainerAssignableTypes(opts.membershipTypes ?? [])
  const aerobicTypes = filterAerobicSalesTypes(opts.membershipTypes ?? [])
  const trainerPayrollTotal = aggregatePayrollFromDailyRows(
    monthRows,
    buildTrainerPayRateMap(trainerTypes),
  ).clubTotal
  const aerobicPayrollTotal = aggregateAerobicPayrollFromDailyRows(
    monthRows,
    buildAerobicPayRateMap(aerobicTypes),
  ).clubTotal

  const profitTotal = summary.profitTotal || 0
  const structure = [
    { key: 'nk', label: 'НК', amount: summary.profitNk, sharePercent: 0 },
    { key: 'dk', label: 'ДК', amount: summary.profitDk, sharePercent: 0 },
    { key: 'uk', label: 'УК', amount: summary.profitUk, sharePercent: 0 },
  ].map((item) => ({
    ...item,
    sharePercent:
      profitTotal > 0 ? Math.round((item.amount / profitTotal) * 1000) / 10 : 0,
  }))

  const { start, end } = monthDateRange(year, month)

  return {
    year,
    month,
    period: { start, end },
    summary: {
      ...summary,
      pnkTotal,
      daysInMonth,
      trainerPayroll: trainerPayrollTotal,
      aerobicPayroll: aerobicPayrollTotal,
    },
    plan: {
      finalTarget,
      achievedLevel,
      progressPercent,
    },
    structure,
    matrix3x3: sumMatrix3x3FromDailyRows(monthRows),
    matrixByHall: sumMatrixTotalsFromDailyRows(monthRows),
    dopRubTotal: sumDopRubFromDailyRows(monthRows),
    dailySeries,
    maxDayProfit,
    dailyPnkSeries,
    maxDayPnk,
    dailyTrainingsSeries,
    maxDayTrainings,
    trainingsStats,
    trainingsTypedTotal,
    dayTable: buildSalesDayTableRows(monthRows),
  }
}
