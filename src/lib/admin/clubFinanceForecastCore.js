/** Прогноз «Финансы клуба»: факт + средние будни/выходных на незаполненные дни (fallback — среднее × дней месяца). Возвраты — темп дня при ≥2 днях с возвратом, иначе факт. */

import { filterAerobicSalesTypes, filterTrainerAssignableTypes } from '../membershipTypesCore.js'
import { normalizeAerobicRowsFromDb, sumAerobicRows } from './aerobicSalesMatrix.js'
import { aggregateAerobicPayrollFromDailyRows, buildAerobicPayRateMap } from './aerobicPayrollCore.js'
import {
  planProgressPercent,
  parseSalesMoney,
  formatRub,
  resolveDailyProfitFromRow,
  refundsFromDailyRow,
  sumDirectionRubFromDailyRows,
  buildHallFinanceSummary,
} from './salesReportCore.js'
import { normalizeMatrixRowsFromDb, sumTypedMatrixRows } from './salesTrainingsMatrix.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
  computeNetProfitWithPayroll,
} from './trainerPayrollCore.js'
import { forecastTrainerMonthPayroll } from './trainerMonthPayrollForecastCore.js'
import {
  FORECAST_METHOD_UNIFORM,
  FORECAST_METHOD_WEEKDAY_WEEKEND,
  computePlanMoneyNormToDate,
  computePlanPaceNeeded,
  projectMonthMetric,
} from './clubFinanceForecastProjection.js'
import { buildGeminiMonthCalendarContext } from './geminiMonthCalendarContext.js'
import { buildPurchaseMixForecast } from './clubFinancePurchaseMixForecastCore.js'
import {
  alignDirectionFactsToClubGross,
  appendUnallocatedPlanRow,
  buildDirectionTotals,
  pruneEmptyExtraDirection,
  reconcileDirectionForecastsToClubGross,
} from './clubFinanceForecastReconcileCore.js'

export { FORECAST_METHOD_UNIFORM, FORECAST_METHOD_WEEKDAY_WEEKEND, computePlanPaceNeeded, computePlanMoneyNormToDate }
export {
  alignDirectionFactsToClubGross,
  appendUnallocatedPlanRow,
  buildDirectionTotals,
  pruneEmptyExtraDirection,
  reconcileDirectionForecastsToClubGross,
  sumDirectionPlanTargets,
  sumRevenueDirectionFact,
  sumRevenueDirectionForecast,
} from './clubFinanceForecastReconcileCore.js'

/**
 * Норма к дате в ₽ для блока прогноза (текущий месяц).
 * Не меняет ISKRA calendar_context и не трогает прогноз на конец / темп до плана.
 *
 * @param {{
 *   year: number,
 *   month: number,
 *   planTarget: number,
 *   factGross: number,
 *   today?: Date,
 * }} opts
 */
export function buildPlanCalendarNorm(opts) {
  const cal = buildGeminiMonthCalendarContext(opts.year, opts.month, opts.today ?? new Date())
  if (!cal || cal.month_relation !== 'current') return null

  const money = computePlanMoneyNormToDate({
    planTarget: opts.planTarget,
    factGross: opts.factGross,
    daysElapsed: cal.days_elapsed,
    daysInMonth: cal.days_in_month,
  })
  if (!money) return null

  /** @type {'strong'|'ok'|'weak'} */
  let tone = 'ok'
  if (money.vs === 'ahead') tone = 'strong'
  else if (money.vs === 'behind') tone = 'weak'

  let vsLabelRu = ''
  if (money.vs === 'ahead') vsLabelRu = 'опережаем норму'
  else if (money.vs === 'on_track') vsLabelRu = 'в темпе нормы'
  else if (money.vs === 'behind') vsLabelRu = 'отстаём от нормы'

  return {
    method: 'plan_times_elapsed_share',
    expectedRub: money.expectedRub,
    lagRub: money.lagRub,
    pacePct: money.pacePct,
    /** Доля полного плана (факт÷план) — для справки, не главный KPI карточки. */
    factPct: money.factPctOfPlan,
    /** Календарная доля месяца (день÷дни) — не путать с темпом. */
    expectedPct: Number(cal.expected_plan_progress_pct) || 0,
    vs: money.vs,
    tone,
    vsLabelRu,
    calendarDay: cal.calendar_day,
    daysElapsed: cal.days_elapsed,
    daysInMonth: cal.days_in_month,
  }
}

export const MIN_REPORT_DAYS_FOR_FORECAST = 3

/** Минимум дней с возвратом > 0, чтобы экстраполировать возвраты на конец месяца. */
export const MIN_REFUND_POSITIVE_DAYS_FOR_PACE = 2

/** Направления для прогноза плана: залы + доп. продажи (чтобы сумма билась с клубом). */
export const FORECAST_DIRECTION_KEYS = ['pz', 'tz', 'az', 'extra']

const FORECAST_DIRECTION_LABELS = { pz: 'ПЗ', tz: 'ТЗ', az: 'АЗ', extra: 'Доп. продажи' }

const FORECAST_DIRECTION_PLAN_KEYS = {
  pz: 'plan_pz',
  tz: 'plan_tz',
  az: 'plan_az',
  extra: 'plan_extra',
}

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
  return calendarMonthRelation(year, month, today) === 0
}

/**
 * Отношение выбранного месяца к «сегодня»: −1 прошлый, 0 текущий, 1 будущий.
 * @param {number} year
 * @param {number} month 1–12
 * @param {Date} [today]
 * @returns {-1|0|1}
 */
export function calendarMonthRelation(year, month, today = new Date()) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0
  const cy = today.getFullYear()
  const cm = today.getMonth() + 1
  if (y < cy || (y === cy && m < cm)) return -1
  if (y > cy || (y === cy && m > cm)) return 1
  return 0
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

/** @param {Array<Record<string, unknown>>} monthRows */
export function countDaysWithPositiveRefunds(monthRows) {
  let n = 0
  for (const row of monthRows ?? []) {
    if (refundsFromDailyRow(row) > 0) n += 1
  }
  return n
}

/**
 * Возвраты к концу месяца: темп будни/выходные, если хватает дней с возвратом; иначе только факт.
 * @param {{
 *   monthRows: Array<Record<string, unknown>>,
 *   year: number,
 *   month: number,
 *   factRefunds: number,
 * }} opts
 */
export function resolveForecastRefunds(opts) {
  const factRefunds = roundRub(opts.factRefunds)
  const positiveDays = countDaysWithPositiveRefunds(opts.monthRows)
  if (positiveDays < MIN_REFUND_POSITIVE_DAYS_FOR_PACE) {
    return {
      forecastRefunds: factRefunds,
      method: 'refunds_static_sparse',
      positiveDays,
      paced: false,
    }
  }
  const proj = projectMonthMetric({
    monthRows: opts.monthRows,
    year: opts.year,
    month: opts.month,
    getValue: (row) => refundsFromDailyRow(row),
    roundFn: roundRub,
  })
  return {
    forecastRefunds: Math.max(factRefunds, proj.forecastTotal),
    method: proj.method,
    positiveDays,
    paced: true,
  }
}

/**
 * ЗП от прогноза часов × средняя ставка за тренировку (чтобы часы и ЗП не разъезжались).
 * @param {{
 *   factHours: number,
 *   factPayroll: number,
 *   forecastHours: number,
 *   fallbackPayroll: number,
 * }} opts
 */
export function resolvePayrollFromHoursPace(opts) {
  const factHours = Number(opts.factHours) || 0
  const factPayroll = roundRub(opts.factPayroll)
  const forecastHours = Math.max(0, Number(opts.forecastHours) || 0)
  const fallback = roundRub(opts.fallbackPayroll)
  if (factHours <= 0 || factPayroll <= 0) {
    return { payroll: fallback, method: 'payroll_pace_fallback', ratePerSession: null }
  }
  const rate = factPayroll / factHours
  return {
    payroll: roundRub(forecastHours * rate),
    method: 'payroll_from_hours',
    ratePerSession: roundRub(rate),
  }
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
  const parseDir = (key) => {
    const n = parseSalesMoney(planForm?.[key])
    return Number.isNaN(n) ? 0 : roundRub(n)
  }
  return {
    level3: Number.isNaN(level3) ? 0 : roundRub(level3),
    directions: {
      plan_pz: parseDir('plan_pz'),
      plan_tz: parseDir('plan_tz'),
      plan_az: parseDir('plan_az'),
      plan_extra: parseDir('plan_extra'),
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
 * Направления, по которым прогноз выручки не дотягивает до плана направления.
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
    summaryRu = `По ${d.label}: прогноз ${formatRub(d.forecast)} при плане ${formatRub(d.planTarget)} — не хватает ${formatRub(d.gapRub)}.`
  } else if (lagging.length > 1) {
    summaryRu = `Отставание по направлениям: ${lagging.map((d) => `${d.label} −${formatRub(d.gapRub)}`).join(', ')}.`
  }

  return {
    lagging,
    has_lag: lagging.length > 0,
    summary_ru: summaryRu,
  }
}

/**
 * @param {string} key
 * @param {Array<Record<string, unknown>>} monthRows
 */
function directionUsesRevenueMode(key, monthRows) {
  if (key === 'tz' || key === 'extra') return true
  return hasDirectionRevenueForHall(monthRows, key)
}

/**
 * Согласовать строки направлений с клубным фактом/прогнозом и финалом плана.
 * @param {Array<object>} directionRows
 * @param {{
 *   factGross: number,
 *   forecastGross: number,
 *   level3: number,
 *   closedMonth: boolean,
 * }} opts
 * @returns {{ directions: Array<object>, totals: ReturnType<typeof buildDirectionTotals> }}
 */
function finalizeDirectionTable(directionRows, opts) {
  const describeReach = describePlanForecastReach
  let rows = alignDirectionFactsToClubGross(directionRows, opts.factGross, {
    syncForecast: opts.closedMonth === true,
    describeReach,
  })
  if (!opts.closedMonth) {
    rows = reconcileDirectionForecastsToClubGross(rows, opts.forecastGross, { describeReach })
  }
  rows = pruneEmptyExtraDirection(rows)
  rows = appendUnallocatedPlanRow(rows, opts.level3, describeReach)
  const totals = buildDirectionTotals({
    directions: rows,
    level3: opts.level3,
    factGross: opts.factGross,
    forecastGross: opts.forecastGross,
    closedMonth: opts.closedMonth,
  })
  return { directions: rows, totals }
}

/**
 * Направления за закрытый месяц — только факт (прогноз = факт).
 * @param {Array<Record<string, unknown>>} monthRows
 * @param {Record<string, number>} planDirections
 */
function buildDirectionFactRows(monthRows, planDirections) {
  const factRub = sumDirectionRubFromDailyRows(monthRows)
  return FORECAST_DIRECTION_KEYS.map((key) => {
    const planKey = FORECAST_DIRECTION_PLAN_KEYS[key]
    const planTarget = Number(planDirections?.[planKey]) || 0
    const useRevenue = directionUsesRevenueMode(key, monthRows)

    if (useRevenue) {
      const factRevenue = roundRub(factRub[key] || 0)
      return {
        key,
        label: FORECAST_DIRECTION_LABELS[key],
        mode: 'revenue',
        planTarget,
        fact: factRevenue,
        forecast: factRevenue,
        factProgressPercent: planProgressPercent(factRevenue, planTarget),
        forecastProgressPercent: planProgressPercent(factRevenue, planTarget),
        reach: describePlanForecastReach(
          planProgressPercent(factRevenue, planTarget),
          planTarget,
          factRevenue,
        ),
      }
    }

    const factTrainings = roundCount(
      monthRows.reduce(
        (sum, row) => sum + (key === 'pz' ? pzTrainingsFromDailyRow(row) : azTrainingsFromDailyRow(row)),
        0,
      ),
    )
    return {
      key,
      label: FORECAST_DIRECTION_LABELS[key],
      mode: 'no_revenue',
      planTarget,
      fact: factTrainings,
      forecast: factTrainings,
      trainingsFact: factTrainings,
      trainingsForecast: factTrainings,
      factProgressPercent: 0,
      forecastProgressPercent: 0,
      reach: describePlanForecastReach(0, 0, 0),
    }
  })
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
    const useRevenue = directionUsesRevenueMode(key, monthRows)

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
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
 * }} opts
 */
export function buildClubFinanceForecast(opts) {
  const year = Number(opts.year)
  const month = Number(opts.month)
  const today = opts.today ?? new Date()
  const monthRows = opts.monthRows ?? []
  const reportDays = monthRows.length
  const relation = calendarMonthRelation(year, month, today)

  /** Будущий месяц — ни факта, ни прогноза. */
  if (relation === 1) {
    return { ok: false, reason: 'not_current_month' }
  }

  const closedMonth = relation === -1

  /** Прогноз в текущем месяце — после минимума отчётов; закрытый месяц — факт даже с 0–2 днями. */
  if (!closedMonth && reportDays < MIN_REPORT_DAYS_FOR_FORECAST) {
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

  const trainerPayrollFact = aggregatePayrollFromDailyRows(
    monthRows,
    trainerRateMap,
    trainerTypes.length
      ? {
          membershipTypes: trainerTypes,
          planConfig: opts.planConfig,
          profilesByTrainerId: opts.profilesByTrainerId,
          clubId: opts.clubId,
        }
      : undefined,
  ).clubTotal
  const aerobicPayrollFact = aggregateAerobicPayrollFromDailyRows(monthRows, aerobicRateMap).clubTotal
  const expense = roundRub(opts.expense)

  const factEarnings = roundRub(earningsTotal)
  const factRefunds = roundRub(refundsTotal)
  const factGross = roundRub(earningsGrossTotal)
  const factNetProfit = computeNetProfitWithPayroll(
    factEarnings,
    trainerPayrollFact,
    expense,
    aerobicPayrollFact,
  )

  const planTargets = readPlanTargetsFromForm(opts.planForm)
  const planLevel3 = planTargets.level3
  const factPlanProgress = planProgressPercent(factGross, planLevel3)

  /** Закрытый месяц: только факт (прогноз = факт, без экстраполяции на «дыры»). */
  if (closedMonth) {
    const factSnapshot = {
      earnings: factEarnings,
      earningsGross: factGross,
      refunds: factRefunds,
      pzTrainings: pzTrainingsTotal,
      azTrainings: azTrainingsTotal,
      trainerPayroll: trainerPayrollFact,
      aerobicPayroll: aerobicPayrollFact,
      expense,
      netProfit: factNetProfit,
    }
    const { directions: directionRows, totals: directionTotals } = finalizeDirectionTable(
      buildDirectionFactRows(monthRows, planTargets.directions),
      { factGross, forecastGross: factGross, level3: planLevel3, closedMonth: true },
    )
    const planReach = describePlanForecastReach(factPlanProgress, planLevel3, factGross)
    const purchaseMix = buildPurchaseMixForecast({
      monthRows,
      year,
      month,
      planForm: opts.planForm,
      closedMonth: true,
      factProfitGross: factGross,
      profitPaceGross: factGross,
    })
    return {
      ok: true,
      closedMonth: true,
      reportDays,
      daysInMonth,
      method: 'closed_month_fact',
      scale: 1,
      dayType: {
        weekdaySamples: 0,
        weekendSamples: 0,
        weekdayAvgGross: 0,
        weekendAvgGross: 0,
        remainingWeekdays: 0,
        remainingWeekends: 0,
      },
      plan: {
        level3: planLevel3,
        factGross,
        forecastGross: factGross,
        factProgressPercent: factPlanProgress,
        forecastProgressPercent: factPlanProgress,
        reach: planReach,
        directions: directionRows,
        totals: directionTotals,
        directionLag: buildDirectionForecastLagSummary(directionRows),
        pace: null,
        calendarNorm: null,
        purchaseMix,
      },
      fact: factSnapshot,
      forecast: { ...factSnapshot },
      avgPerReportDay:
        reportDays > 0
          ? {
              earnings: roundRub(earningsTotal / reportDays),
              refunds: roundRub(refundsTotal / reportDays),
              pzTrainings: roundRub(pzTrainingsTotal / reportDays),
              azTrainings: roundRub(azTrainingsTotal / reportDays),
              trainerPayroll: roundRub(trainerPayrollFact / reportDays),
              aerobicPayroll: roundRub(aerobicPayrollFact / reportDays),
            }
          : {
              earnings: 0,
              refunds: 0,
              pzTrainings: 0,
              azTrainings: 0,
              trainerPayroll: 0,
              aerobicPayroll: 0,
            },
    }
  }

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

  const profitPaceGross = grossProj.forecastTotal
  const purchaseMix = buildPurchaseMixForecast({
    monthRows,
    year,
    month,
    planForm: opts.planForm,
    closedMonth: false,
    factProfitGross: factGross,
    profitPaceGross,
  })
  const forecastGross = purchaseMix.clubBlend.forecastGross
  const refundsProj = resolveForecastRefunds({
    monthRows,
    year,
    month,
    factRefunds,
  })
  const forecastRefunds = refundsProj.forecastRefunds
  const forecastEarnings = roundRub(forecastGross - forecastRefunds)
  const forecastPzTrainings = pzTrainProj.forecastTotal
  const forecastAzTrainings = azTrainProj.forecastTotal
  const trainerPayFromHours = forecastTrainerMonthPayroll({
    monthRows,
    membershipTypes: trainerTypes,
    planConfig: opts.planConfig,
    profilesByTrainerId: opts.profilesByTrainerId,
    clubId: opts.clubId,
    forecastClubHours: forecastPzTrainings,
    factClubHours: pzTrainingsTotal,
    factPayroll: trainerPayrollFact,
    fallbackPayroll: trainerPayProj.forecastTotal,
  })
  const aerobicPayFromHours = resolvePayrollFromHoursPace({
    factHours: azTrainingsTotal,
    factPayroll: aerobicPayrollFact,
    forecastHours: forecastAzTrainings,
    fallbackPayroll: aerobicPayProj.forecastTotal,
  })
  const forecastTrainerPayroll = trainerPayFromHours.payroll
  const forecastAerobicPayroll = aerobicPayFromHours.payroll

  const forecastNetProfit = computeNetProfitWithPayroll(
    forecastEarnings,
    forecastTrainerPayroll,
    expense,
    forecastAerobicPayroll,
  )

  const forecastPlanProgress = planProgressPercent(forecastGross, planLevel3)
  const planReach = describePlanForecastReach(forecastPlanProgress, planLevel3, forecastGross)
  let directionRows = buildDirectionForecastRows(monthRows, year, month, planTargets.directions)
  if (purchaseMix.clubBlend.trusted) {
    directionRows = directionRows.map((dir) => {
      const mixHall = purchaseMix.byHall?.[dir.key]
      if (!mixHall || dir.mode !== 'revenue' || dir.key === 'extra') return dir
      const forecastRevenue = roundRub(mixHall.forecast)
      const factRevenue = roundRub(mixHall.fact)
      return {
        ...dir,
        fact: factRevenue,
        forecast: forecastRevenue,
        factProgressPercent: planProgressPercent(factRevenue, dir.planTarget),
        forecastProgressPercent: planProgressPercent(forecastRevenue, dir.planTarget),
        reach: describePlanForecastReach(
          planProgressPercent(forecastRevenue, dir.planTarget),
          dir.planTarget,
          forecastRevenue,
        ),
        fromPurchaseMix: true,
      }
    })
  }
  const finalized = finalizeDirectionTable(directionRows, {
    factGross,
    forecastGross,
    level3: planLevel3,
    closedMonth: false,
  })
  directionRows = finalized.directions
  const directionTotals = finalized.totals
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
          planTarget: planLevel3,
          factGross,
          today,
        })
      : null

  return {
    ok: true,
    closedMonth: false,
    reportDays,
    daysInMonth,
    method: purchaseMix.clubBlend.trusted
      ? purchaseMix.clubBlend.method
      : grossProj.method,
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
      totals: directionTotals,
      directionLag,
      pace,
      calendarNorm,
      purchaseMix,
      profitPaceGross,
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
    refundsPace: {
      method: refundsProj.method,
      paced: refundsProj.paced,
      positiveDays: refundsProj.positiveDays,
    },
    payrollPace: {
      trainer: trainerPayFromHours.method,
      aerobic: aerobicPayFromHours.method,
      trainerRatePerSession: trainerPayFromHours.ratePerSession,
      aerobicRatePerSession: aerobicPayFromHours.ratePerSession,
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
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
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
    planConfig: opts.planConfig,
    profilesByTrainerId: opts.profilesByTrainerId,
    clubId: opts.clubId,
  })

  if (!fc.ok) {
    return {
      available: false,
      reason: fc.reason,
      report_days: fc.reportDays ?? 0,
      min_report_days: fc.minReportDays ?? MIN_REPORT_DAYS_FOR_FORECAST,
    }
  }

  /** Прогноз «на конец месяца» — только текущий; закрытый месяц смотрите в fact / club_finance. */
  if (fc.closedMonth) {
    return {
      available: false,
      reason: 'not_current_month',
      report_days: fc.reportDays ?? 0,
      min_report_days: MIN_REPORT_DAYS_FOR_FORECAST,
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
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
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
    planConfig: opts.planConfig,
    profilesByTrainerId: opts.profilesByTrainerId,
    clubId: opts.clubId,
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
    closed_month: fc.closedMonth === true,
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
        unallocated_plan: d.unallocatedPlan === true,
      })),
      direction_lag: fc.plan.directionLag ?? { lagging: [], has_lag: false, summary_ru: '' },
      totals: fc.plan.totals
        ? {
            plan_sum_rub: fc.plan.totals.planSum,
            fact_sum_rub: fc.plan.totals.factSum,
            forecast_sum_rub: fc.plan.totals.forecastSum,
            club_gap_rub: fc.plan.totals.clubGapRub,
            plan_vs_level3_rub: fc.plan.totals.planVsLevel3,
            unallocated_rub: fc.plan.totals.unallocatedRub,
            directions_below: fc.plan.totals.directionsBelow,
            directions_above: fc.plan.totals.directionsAbove,
            plan_note_ru: fc.plan.totals.planNoteRu,
          }
        : null,
    },
  }

  if (includeFinance) {
    block.forecast.net_profit_rub = fc.forecast.netProfit
  }

  return block
}
