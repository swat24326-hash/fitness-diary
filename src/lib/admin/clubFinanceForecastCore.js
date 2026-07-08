/** Прогноз «Финансы клуба»: среднее по отчётам месяца × дней в месяце (только текущий месяц). Возвраты в прогнозе — статическая сумма из отчётов. */

import { filterAerobicSalesTypes, filterTrainerAssignableTypes } from '../membershipTypesCore.js'
import { normalizeAerobicRowsFromDb, sumAerobicRows } from './aerobicSalesMatrix.js'
import { aggregateAerobicPayrollFromDailyRows, buildAerobicPayRateMap } from './aerobicPayrollCore.js'
import {
  planProgressPercent,
  parseSalesMoney,
  resolveDailyProfitFromRow,
  sumDirectionRubFromDailyRows,
} from './salesReportCore.js'
import { normalizeMatrixRowsFromDb, sumTypedMatrixRows } from './salesTrainingsMatrix.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
  computeNetProfitWithPayroll,
} from './trainerPayrollCore.js'

export const MIN_REPORT_DAYS_FOR_FORECAST = 3

/** Направления для прогноза плана (без доп. продаж в таблице направлений). */
export const FORECAST_DIRECTION_KEYS = ['pz', 'tz', 'az']

const FORECAST_DIRECTION_LABELS = { pz: 'ПЗ', tz: 'ТЗ', az: 'АЗ' }

const FORECAST_DIRECTION_PLAN_KEYS = { pz: 'plan_pz', tz: 'plan_tz', az: 'plan_az' }

function roundRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function roundCount(n) {
  return Math.round(Number(n) || 0)
}

/**
 * @param {number} year
 * @param {number} month 1–12
 * @param {Date} [today]
 */
export function isCurrentCalendarMonth(year, month, today = new Date()) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return false
  return y === today.getFullYear() && m === today.getMonth() + 1
}

/** @param {number} year @param {number} month */
export function daysInCalendarMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate()
}

/** @param {Record<string, unknown> | null | undefined} row */
export function pzTrainingsFromDailyRow(row) {
  return sumTypedMatrixRows(normalizeMatrixRowsFromDb(row?.trainings_matrix))
}

/** @param {Record<string, unknown> | null | undefined} row */
export function azTrainingsFromDailyRow(row) {
  return sumAerobicRows(normalizeAerobicRowsFromDb(row?.aerobic_sales_matrix))
}

/** @param {Array<Record<string, unknown>>} monthRows @param {'pz'|'tz'|'az'} hall */
export function hasDirectionRevenueForHall(monthRows, hall) {
  const rub = sumDirectionRubFromDailyRows(monthRows)
  return (Number(rub[hall]) || 0) > 0
}

/**
 * @param {Record<string, string | number | undefined> | null | undefined} planForm
 */
export function readPlanTargetsFromForm(planForm) {
  const level3 = parseSalesMoney(planForm?.plan_level_3)
  return {
    level3: Number.isNaN(level3) ? 0 : roundRub(level3),
    directions: {
      plan_pz: Number.isNaN(parseSalesMoney(planForm?.plan_pz)) ? 0 : roundRub(parseSalesMoney(planForm?.plan_pz)),
      plan_tz: Number.isNaN(parseSalesMoney(planForm?.plan_tz)) ? 0 : roundRub(parseSalesMoney(planForm?.plan_tz)),
      plan_az: Number.isNaN(parseSalesMoney(planForm?.plan_az)) ? 0 : roundRub(parseSalesMoney(planForm?.plan_az)),
    },
  }
}

/**
 * @param {number} forecastProgress
 * @param {number} target
 * @param {number} forecastAmount
 */
export function describePlanForecastReach(forecastProgress, target, forecastAmount) {
  if (target <= 0) {
    return { tone: 'muted', willReach: false, forecastProgressPercent: forecastProgress, gapRub: 0 }
  }
  const willReach = forecastProgress >= 100
  const gapRub = willReach ? 0 : roundRub(target - forecastAmount)
  let tone = 'weak'
  if (willReach) tone = 'strong'
  else if (forecastProgress >= 90) tone = 'ok'
  return { tone, willReach, forecastProgressPercent: forecastProgress, gapRub }
}

function buildDirectionForecastRows(monthRows, scale, planDirections) {
  const factRub = sumDirectionRubFromDailyRows(monthRows)
  return FORECAST_DIRECTION_KEYS.map((key) => {
    const planKey = FORECAST_DIRECTION_PLAN_KEYS[key]
    const planTarget = Number(planDirections?.[planKey]) || 0
    const useRevenue = key === 'tz' ? true : hasDirectionRevenueForHall(monthRows, key)

    if (useRevenue) {
      const factRevenue = roundRub(factRub[key] || 0)
      const forecastRevenue = roundRub(factRevenue * scale)
      return {
        key,
        label: FORECAST_DIRECTION_LABELS[key],
        mode: 'revenue',
        planTarget,
        fact: factRevenue,
        forecast: forecastRevenue,
        factProgressPercent: planProgressPercent(factRevenue, planTarget),
        forecastProgressPercent: planProgressPercent(forecastRevenue, planTarget),
        reach: describePlanForecastReach(
          planProgressPercent(forecastRevenue, planTarget),
          planTarget,
          forecastRevenue,
        ),
      }
    }

    let factTrainings = 0
    for (const row of monthRows) {
      factTrainings += key === 'pz' ? pzTrainingsFromDailyRow(row) : azTrainingsFromDailyRow(row)
    }
    const forecastTrainings = roundCount(factTrainings * scale)
    return {
      key,
      label: FORECAST_DIRECTION_LABELS[key],
      mode: 'trainings',
      planTarget,
      fact: factTrainings,
      forecast: forecastTrainings,
      factProgressPercent: 0,
      forecastProgressPercent: 0,
      reach: { tone: 'muted', willReach: false, forecastProgressPercent: 0, gapRub: 0, trainingsFallback: true },
    }
  })
}

/**
 * @param {{
 *   monthRows: Array<Record<string, unknown>>,
 *   year: number,
 *   month: number,
 *   expense?: number,
 *   membershipTypes?: Array<Record<string, unknown>>,
 *   planForm?: Record<string, string | number | undefined>,
 *   today?: Date,
 * }} opts
 */
export function buildClubFinanceForecast(opts) {
  const year = Number(opts.year)
  const month = Number(opts.month)
  const today = opts.today ?? new Date()
  const monthRows = opts.monthRows ?? []
  const reportDays = monthRows.length

  if (!isCurrentCalendarMonth(year, month, today)) {
    return { ok: false, reason: 'not_current_month' }
  }

  if (reportDays < MIN_REPORT_DAYS_FOR_FORECAST) {
    return {
      ok: false,
      reason: 'insufficient_reports',
      reportDays,
      minReportDays: MIN_REPORT_DAYS_FOR_FORECAST,
    }
  }

  const daysInMonth = daysInCalendarMonth(year, month)
  const scale = daysInMonth / reportDays

  let earningsTotal = 0
  let earningsGrossTotal = 0
  let refundsTotal = 0
  let pzTrainingsTotal = 0
  let azTrainingsTotal = 0

  for (const row of monthRows) {
    const daily = resolveDailyProfitFromRow(row)
    earningsTotal += daily.net
    earningsGrossTotal += daily.gross
    refundsTotal += daily.refunds
    pzTrainingsTotal += pzTrainingsFromDailyRow(row)
    azTrainingsTotal += azTrainingsFromDailyRow(row)
  }

  const trainerTypes = filterTrainerAssignableTypes(opts.membershipTypes ?? [])
  const aerobicTypes = filterAerobicSalesTypes(opts.membershipTypes ?? [])
  const trainerRateMap = buildTrainerPayRateMap(trainerTypes)
  const aerobicRateMap = buildAerobicPayRateMap(aerobicTypes)

  const trainerPayrollFact = aggregatePayrollFromDailyRows(monthRows, trainerRateMap).clubTotal
  const aerobicPayrollFact = aggregateAerobicPayrollFromDailyRows(monthRows, aerobicRateMap).clubTotal
  const expense = roundRub(opts.expense)

  const factEarnings = roundRub(earningsTotal)
  const factRefunds = roundRub(refundsTotal)
  const factGross = roundRub(earningsGrossTotal)
  const forecastGross = roundRub(earningsGrossTotal * scale)
  /** Возвраты в прогнозе — только факт из отчётов, без экстраполяции на конец месяца. */
  const forecastRefunds = factRefunds
  const forecastEarnings = roundRub(forecastGross - forecastRefunds)
  const forecastPzTrainings = roundCount(pzTrainingsTotal * scale)
  const forecastAzTrainings = roundCount(azTrainingsTotal * scale)
  const forecastTrainerPayroll = roundRub(trainerPayrollFact * scale)
  const forecastAerobicPayroll = roundRub(aerobicPayrollFact * scale)

  const factNetProfit = computeNetProfitWithPayroll(
    factEarnings,
    trainerPayrollFact,
    expense,
    aerobicPayrollFact,
  )

  const forecastNetProfit = computeNetProfitWithPayroll(
    forecastEarnings,
    forecastTrainerPayroll,
    expense,
    forecastAerobicPayroll,
  )

  const planTargets = readPlanTargetsFromForm(opts.planForm)
  const planLevel3 = planTargets.level3
  const factPlanProgress = planProgressPercent(factGross, planLevel3)
  const forecastPlanProgress = planProgressPercent(forecastGross, planLevel3)
  const planReach = describePlanForecastReach(forecastPlanProgress, planLevel3, forecastGross)
  const directionRows = buildDirectionForecastRows(monthRows, scale, planTargets.directions)

  return {
    ok: true,
    reportDays,
    daysInMonth,
    scale: Math.round(scale * 10000) / 10000,
    plan: {
      level3: planLevel3,
      factGross,
      forecastGross,
      factProgressPercent: factPlanProgress,
      forecastProgressPercent: forecastPlanProgress,
      reach: planReach,
      directions: directionRows,
    },
    fact: {
      earnings: factEarnings,
      earningsGross: factGross,
      refunds: factRefunds,
      pzTrainings: pzTrainingsTotal,
      azTrainings: azTrainingsTotal,
      trainerPayroll: trainerPayrollFact,
      aerobicPayroll: aerobicPayrollFact,
      expense,
      netProfit: factNetProfit,
    },
    forecast: {
      earnings: forecastEarnings,
      earningsGross: forecastGross,
      refunds: forecastRefunds,
      pzTrainings: forecastPzTrainings,
      azTrainings: forecastAzTrainings,
      trainerPayroll: forecastTrainerPayroll,
      aerobicPayroll: forecastAerobicPayroll,
      expense,
      netProfit: forecastNetProfit,
    },
    avgPerReportDay: {
      earnings: roundRub(earningsTotal / reportDays),
      refunds: roundRub(refundsTotal / reportDays),
      pzTrainings: roundRub(pzTrainingsTotal / reportDays),
      azTrainings: roundRub(azTrainingsTotal / reportDays),
      trainerPayroll: roundRub(trainerPayrollFact / reportDays),
      aerobicPayroll: roundRub(aerobicPayrollFact / reportDays),
    },
  }
}

/**
 * Компактный прогноз месяца для ИСКРЫ — только готовые поля, без детализации направлений.
 * @param {{
 *   monthRows: Array<Record<string, unknown>>,
 *   year: number,
 *   month: number,
 *   expense?: number,
 *   membershipTypes?: Array<Record<string, unknown>>,
 *   planForm?: Record<string, string | number | undefined> | null,
 *   includeFinance?: boolean,
 *   today?: Date,
 * }} opts
 */
export function buildIskraMonthForecastSummary(opts) {
  const includeFinance = opts.includeFinance !== false
  const fc = buildClubFinanceForecast({
    monthRows: opts.monthRows ?? [],
    year: opts.year,
    month: opts.month,
    expense: opts.expense,
    membershipTypes: opts.membershipTypes,
    planForm: opts.planForm ?? undefined,
    today: opts.today,
  })

  if (!fc.ok) {
    return {
      available: false,
      reason: fc.reason,
      report_days: fc.reportDays ?? 0,
      min_report_days: fc.minReportDays ?? MIN_REPORT_DAYS_FOR_FORECAST,
    }
  }

  const planLevel3 = fc.plan.level3
  const forecastGross = fc.plan.forecastGross
  const surplus =
    planLevel3 > 0 && forecastGross > planLevel3 ? roundRub(forecastGross - planLevel3) : 0
  const shortfall =
    planLevel3 > 0 && forecastGross < planLevel3 ? roundRub(planLevel3 - forecastGross) : 0

  /** @type {Record<string, unknown>} */
  const summary = {
    available: true,
    method: 'avg_per_report_day_times_days_in_month',
    report_days: fc.reportDays,
    days_in_month: fc.daysInMonth,
    plan_level_3: planLevel3,
    forecast_gross_total: forecastGross,
    forecast_earnings_net: fc.forecast.earnings,
    forecast_plan_pct: fc.plan.forecastProgressPercent,
    shortfall_rub: shortfall,
    surplus_rub: surplus,
    will_reach_plan: fc.plan.reach.willReach,
  }

  if (includeFinance) {
    summary.forecast_net_profit = fc.forecast.netProfit
  }

  return summary
}
