/** Прогноз «Финансы клуба»: факт + средние будни/выходных на незаполненные дни (fallback — среднее × дней месяца). Возвраты — статическая сумма. */

import { filterAerobicSalesTypes, filterTrainerAssignableTypes } from '../membershipTypesCore.js'
import { normalizeAerobicRowsFromDb, sumAerobicRows } from './aerobicSalesMatrix.js'
import { aggregateAerobicPayrollFromDailyRows, buildAerobicPayRateMap } from './aerobicPayrollCore.js'
import {
  planProgressPercent,
  parseSalesMoney,
  formatRub,
  resolveDailyProfitFromRow,
  sumDirectionRubFromDailyRows,
  buildHallFinanceSummary,
} from './salesReportCore.js'
import { normalizeMatrixRowsFromDb, sumTypedMatrixRows } from './salesTrainingsMatrix.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
  computeNetProfitWithPayroll,
} from './trainerPayrollCore.js'
import {
  FORECAST_METHOD_UNIFORM,
  FORECAST_METHOD_WEEKDAY_WEEKEND,
  computePlanPaceNeeded,
  projectMonthMetric,
} from './clubFinanceForecastProjection.js'
import {
  buildGeminiMonthCalendarContext,
  comparePlanToCalendar,
} from './geminiMonthCalendarContext.js'

export { FORECAST_METHOD_UNIFORM, FORECAST_METHOD_WEEKDAY_WEEKEND, computePlanPaceNeeded }

/**
 * Норма к дате (линейный % календаря) рядом с фактом плана — только текущий месяц.
 * @param {{
 *   year: number,
 *   month: number,
 *   factProgressPercent: number,
 *   today?: Date,
 * }} opts
 */
export function buildPlanCalendarNorm(opts) {
  const cal = buildGeminiMonthCalendarContext(opts.year, opts.month, opts.today ?? new Date())
  if (!cal || cal.month_relation !== 'current') return null

  const expectedPct = Number(cal.expected_plan_progress_pct) || 0
  const factPct = Number(opts.factProgressPercent) || 0
  const vs = comparePlanToCalendar(factPct, cal)
  /** @type {'strong'|'ok'|'weak'} */
  let tone = 'ok'
  if (vs === 'ahead') tone = 'strong'
  else if (vs === 'behind') tone = 'weak'

  let vsLabelRu = ''
  if (vs === 'ahead') vsLabelRu = 'опережаем календарь'
  else if (vs === 'on_track') vsLabelRu = 'в темпе календаря'
  else if (vs === 'behind') vsLabelRu = 'отстаём от календаря'

  return {
    expectedPct,
    factPct,
    vs,
    tone,
    vsLabelRu,
    calendarDay: cal.calendar_day,
    daysElapsed: cal.days_elapsed,
    daysInMonth: cal.days_in_month,
  }
}

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

/**
 * Залы (ПЗ/ТЗ/АЗ), по которым прогноз выручки не дотягивает до плана направления.
 * @param {Array<{ key?: string, label?: string, mode?: string, planTarget?: number, forecast?: number, forecastProgressPercent?: number, reach?: { willReach?: boolean, gapRub?: number } }>} directionRows
 */
export function buildDirectionForecastLagSummary(directionRows) {
  const lagging = (directionRows ?? [])
    .filter((d) => d.planTarget > 0 && d.mode === 'revenue' && d.reach?.willReach !== true)
    .map((d) => ({
      key: String(d.key ?? ''),
      label: String(d.label ?? d.key ?? '').trim() || String(d.key ?? ''),
      planTarget: roundRub(d.planTarget),
      forecast: roundRub(d.forecast),
      gapRub: roundRub(d.reach?.gapRub ?? Math.max(0, Number(d.planTarget) - Number(d.forecast))),
      forecastProgressPercent: Number(d.forecastProgressPercent) || 0,
    }))
    .sort((a, b) => a.forecastProgressPercent - b.forecastProgressPercent)

  let summaryRu = ''
  if (lagging.length === 1) {
    const d = lagging[0]
    summaryRu = `По залу ${d.label}: прогноз ${formatRub(d.forecast)} при плане ${formatRub(d.planTarget)} — не хватает ${formatRub(d.gapRub)}.`
  } else if (lagging.length > 1) {
    summaryRu = `Отставание по залам: ${lagging.map((d) => `${d.label} −${formatRub(d.gapRub)}`).join(', ')}.`
  }

  return {
    lagging,
    has_lag: lagging.length > 0,
    summary_ru: summaryRu,
  }
}

/**
 * @param {Array<Record<string, unknown>>} monthRows
 * @param {number} year
 * @param {number} month
 * @param {Record<string, number>} planDirections
 */
function buildDirectionForecastRows(monthRows, year, month, planDirections) {
  const factRub = sumDirectionRubFromDailyRows(monthRows)
  return FORECAST_DIRECTION_KEYS.map((key) => {
    const planKey = FORECAST_DIRECTION_PLAN_KEYS[key]
    const planTarget = Number(planDirections?.[planKey]) || 0
    const useRevenue = key === 'tz' ? true : hasDirectionRevenueForHall(monthRows, key)

    if (useRevenue) {
      const projected = projectMonthMetric({
        monthRows,
        year,
        month,
        getValue: (row) => {
          const dayRub = sumDirectionRubFromDailyRows([row])
          return Number(dayRub[key]) || 0
        },
        roundFn: roundRub,
      })
      const factRevenue = roundRub(factRub[key] || 0)
      const forecastRevenue = projected.forecastTotal
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

    const projectedTrainings = projectMonthMetric({
      monthRows,
      year,
      month,
      getValue: (row) => (key === 'pz' ? pzTrainingsFromDailyRow(row) : azTrainingsFromDailyRow(row)),
      roundFn: roundCount,
    })
    /** Нет ₽ по залу — не сравниваем тренировки (шт) с планом в ₽. */
    return {
      key,
      label: FORECAST_DIRECTION_LABELS[key],
      mode: 'no_revenue',
      planTarget,
      fact: 0,
      forecast: 0,
      trainingsFact: projectedTrainings.fact,
      trainingsForecast: projectedTrainings.forecastTotal,
      factProgressPercent: 0,
      forecastProgressPercent: 0,
      noteRu: 'Нет выручки по залу',
      reach: {
        tone: 'muted',
        willReach: false,
        forecastProgressPercent: 0,
        gapRub: 0,
        noRevenue: true,
      },
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

  const grossProj = projectMonthMetric({
    monthRows,
    year,
    month,
    getValue: (row) => resolveDailyProfitFromRow(row).gross,
    roundFn: roundRub,
  })
  const pzTrainProj = projectMonthMetric({
    monthRows,
    year,
    month,
    getValue: (row) => pzTrainingsFromDailyRow(row),
    roundFn: roundCount,
  })
  const azTrainProj = projectMonthMetric({
    monthRows,
    year,
    month,
    getValue: (row) => azTrainingsFromDailyRow(row),
    roundFn: roundCount,
  })
  const trainerPayProj = projectMonthMetric({
    monthRows,
    year,
    month,
    getValue: (row) => aggregatePayrollFromDailyRows([row], trainerRateMap).clubTotal,
    roundFn: roundRub,
  })
  const aerobicPayProj = projectMonthMetric({
    monthRows,
    year,
    month,
    getValue: (row) => aggregateAerobicPayrollFromDailyRows([row], aerobicRateMap).clubTotal,
    roundFn: roundRub,
  })

  const factEarnings = roundRub(earningsTotal)
  const factRefunds = roundRub(refundsTotal)
  const factGross = roundRub(earningsGrossTotal)
  const forecastGross = grossProj.forecastTotal
  /** Возвраты в прогнозе — только факт из отчётов, без экстраполяции на конец месяца. */
  const forecastRefunds = factRefunds
  const forecastEarnings = roundRub(forecastGross - forecastRefunds)
  const forecastPzTrainings = pzTrainProj.forecastTotal
  const forecastAzTrainings = azTrainProj.forecastTotal
  const forecastTrainerPayroll = trainerPayProj.forecastTotal
  const forecastAerobicPayroll = aerobicPayProj.forecastTotal

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
  const directionRows = buildDirectionForecastRows(monthRows, year, month, planTargets.directions)
  const directionLag = buildDirectionForecastLagSummary(directionRows)
  const pace = computePlanPaceNeeded({
    planTarget: planLevel3,
    factGross,
    remainingWeekdays: grossProj.remainingWeekdays,
    remainingWeekends: grossProj.remainingWeekends,
    daysInMonth,
    reportDays,
  })
  const calendarNorm =
    planLevel3 > 0
      ? buildPlanCalendarNorm({
          year,
          month,
          factProgressPercent: factPlanProgress,
          today,
        })
      : null

  return {
    ok: true,
    reportDays,
    daysInMonth,
    method: grossProj.method,
    scale: grossProj.scale,
    dayType: {
      weekdaySamples: grossProj.weekdaySamples,
      weekendSamples: grossProj.weekendSamples,
      weekdayAvgGross: grossProj.weekdayAvg,
      weekendAvgGross: grossProj.weekendAvg,
      remainingWeekdays: grossProj.remainingWeekdays,
      remainingWeekends: grossProj.remainingWeekends,
    },
    plan: {
      level3: planLevel3,
      factGross,
      forecastGross,
      factProgressPercent: factPlanProgress,
      forecastProgressPercent: forecastPlanProgress,
      reach: planReach,
      directions: directionRows,
      directionLag,
      pace,
      calendarNorm,
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
    method: fc.method ?? FORECAST_METHOD_UNIFORM,
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

/**
 * Блок «Финансы клуба» для ИСКРЫ — тот же движок, что вкладка прогноза в отчёте менеджера.
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
export function buildIskraClubFinanceBlock(opts) {
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

  const hallFinance = buildHallFinanceSummary(
    opts.monthRows ?? [],
    fc.fact.trainerPayroll,
    fc.fact.aerobicPayroll,
  )

  const planLevel3 = fc.plan.level3
  const forecastGross = fc.plan.forecastGross
  const surplus =
    planLevel3 > 0 && forecastGross > planLevel3 ? roundRub(forecastGross - planLevel3) : 0
  const shortfall =
    planLevel3 > 0 && forecastGross < planLevel3 ? roundRub(planLevel3 - forecastGross) : 0

  /** @type {Record<string, unknown>} */
  const block = {
    available: true,
    method: fc.method ?? FORECAST_METHOD_UNIFORM,
    report_days: fc.reportDays,
    days_in_month: fc.daysInMonth,
    fact: {
      plan_gross_rub: fc.plan.factGross,
      plan_target_rub: planLevel3,
      plan_progress_pct: fc.plan.factProgressPercent,
      earnings_rub: fc.fact.earnings,
      refunds_rub: fc.fact.refunds,
      net_profit_rub: fc.fact.netProfit,
      trainer_payroll_rub: fc.fact.trainerPayroll,
      aerobic_payroll_rub: fc.fact.aerobicPayroll,
      supervisor_expense_rub: fc.fact.expense,
      halls: {
        pz_net_profit_rub: hallFinance.pz?.netProfit ?? 0,
        pz_revenue_rub: hallFinance.pz?.revenue ?? 0,
        tz_revenue_rub: hallFinance.tz?.revenue ?? 0,
        az_net_profit_rub: hallFinance.az?.netProfit ?? 0,
        az_revenue_rub: hallFinance.az?.revenue ?? 0,
      },
    },
    forecast: {
      gross_rub: forecastGross,
      earnings_rub: fc.forecast.earnings,
      plan_pct: fc.plan.forecastProgressPercent,
      will_reach_plan: fc.plan.reach.willReach,
      shortfall_rub: shortfall,
      surplus_rub: surplus,
      directions: (fc.plan.directions ?? []).map((d) => ({
        key: d.key,
        label: d.label,
        mode: d.mode,
        plan_target_rub: d.planTarget,
        fact: d.fact,
        forecast: d.forecast,
        fact_progress_pct: d.factProgressPercent,
        forecast_progress_pct: d.forecastProgressPercent,
        will_reach: d.reach?.willReach === true,
        gap_rub: d.reach?.gapRub ?? 0,
        note_ru: d.noteRu ?? null,
        trainings_fact: d.trainingsFact ?? null,
        trainings_forecast: d.trainingsForecast ?? null,
      })),
      direction_lag: fc.plan.directionLag ?? { lagging: [], has_lag: false, summary_ru: '' },
    },
  }

  if (includeFinance) {
    block.forecast.net_profit_rub = fc.forecast.netProfit
  }

  return block
}
