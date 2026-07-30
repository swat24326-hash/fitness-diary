/**
 * Якорь зала для стратегии продаж: часы и ₽ из отчёта менеджера × сезон.
 */

import { aggregateMonthFromDailyRows } from './salesReportCore.js'
import {
  getSalesSeasonMonthDef,
  salesSeasonScale,
  SALES_SEASON_DEFAULTS,
} from './salesSeasonCore.js'

/** Минимум доли заполненных дней месяца, иначе якорь «ненадёжен». */
export const HALL_ANCHOR_MIN_FILL_RATIO = 0.5

/**
 * @param {number} year
 * @param {number} month 1–12
 */
export function daysInCalendarMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  return new Date(y, m, 0).getDate()
}

/**
 * Предыдущий календарный месяц.
 * @param {number} year
 * @param {number} month 1–12
 */
export function previousCalendarYearMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  if (m === 1) return { year: y - 1, month: 12 }
  return { year: y, month: m - 1 }
}

/**
 * @param {Array<Record<string, unknown>>} monthRows
 */
export function summarizeHallMonthFromDailyRows(monthRows) {
  const agg = aggregateMonthFromDailyRows(monthRows)
  return {
    hours: Math.max(0, Math.trunc(Number(agg.trainingsTotal) || 0)),
    rub: Math.round((Number(agg.profitTotal) || 0) * 100) / 100,
    rubDk: Math.round((Number(agg.profitDk) || 0) * 100) / 100,
    dayCount: Math.max(0, Math.trunc(Number(agg.dayCount) || 0)),
  }
}

/**
 * @param {{
 *   baseRows?: object[],
 *   baseYear: number,
 *   baseMonth: number,
 *   planYear: number,
 *   planMonth: number,
 *   seasonTable?: typeof SALES_SEASON_DEFAULTS,
 *   minFillRatio?: number,
 * }} input
 */
export function buildHallAnchorProjection(input) {
  const baseYear = Number(input?.baseYear)
  const baseMonth = Number(input?.baseMonth)
  const planYear = Number(input?.planYear)
  const planMonth = Number(input?.planMonth)
  const table = input?.seasonTable ?? SALES_SEASON_DEFAULTS
  const minFill = Number(input?.minFillRatio)
  const minFillRatio = Number.isFinite(minFill) && minFill > 0 && minFill <= 1 ? minFill : HALL_ANCHOR_MIN_FILL_RATIO

  const daysInBase = daysInCalendarMonth(baseYear, baseMonth)
  if (!daysInBase) {
    return { ok: false, error: 'Некорректный месяц базы' }
  }

  const base = summarizeHallMonthFromDailyRows(input?.baseRows)
  const fillRatio = base.dayCount / daysInBase
  const reliable = fillRatio >= minFillRatio

  const baseSeason = getSalesSeasonMonthDef(baseMonth, table)
  const planSeason = getSalesSeasonMonthDef(planMonth, table)
  const scale = salesSeasonScale(baseMonth, planMonth, table)
  if (!baseSeason || !planSeason || scale == null) {
    return { ok: false, error: 'Не удалось применить сезонность' }
  }

  const expectedHours = Math.max(0, Math.round(base.hours * scale))
  const expectedRub = Math.round(base.rub * scale * 100) / 100
  const expectedRubDk = Math.round(base.rubDk * scale * 100) / 100
  const rubPerHour = base.hours > 0 ? Math.round((base.rub / base.hours) * 100) / 100 : null

  return {
    ok: true,
    base: {
      year: baseYear,
      month: baseMonth,
      hours: base.hours,
      rub: base.rub,
      rubDk: base.rubDk,
      dayCount: base.dayCount,
      daysInMonth: daysInBase,
      fillRatio: Math.round(fillRatio * 1000) / 1000,
      season: baseSeason,
    },
    plan: {
      year: planYear,
      month: planMonth,
      season: planSeason,
    },
    scale,
    expectedHours,
    expectedRub,
    expectedRubDk,
    rubPerHour,
    reliable,
    minFillRatio,
  }
}

/**
 * Доля куска ПЗ·ДК от якоря ₽ (0…1+).
 * @param {number} pzDkAmount
 * @param {number} anchorRub
 */
export function pzDkShareOfAnchor(pzDkAmount, anchorRub) {
  const a = Number(pzDkAmount) || 0
  const b = Number(anchorRub) || 0
  if (!(b > 0) || !(a >= 0)) return null
  return Math.round((a / b) * 1000) / 1000
}

/**
 * Дыра до уровня 3 плана.
 * @param {number} planLevel3
 * @param {number} expectedRub
 */
export function gapToPlanLevel3(planLevel3, expectedRub) {
  const target = Number(planLevel3) || 0
  const exp = Number(expectedRub) || 0
  if (!(target > 0)) return null
  return Math.max(0, Math.round((target - exp) * 100) / 100)
}
