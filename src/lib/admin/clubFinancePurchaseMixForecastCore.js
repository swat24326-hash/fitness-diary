/**
 * Прогноз покупок по матрице ПЗ/ТЗ/АЗ × НК/ДК/УК:
 * факт месяца + темп (будни/выходные) + допущения плана (шт × ср. чек).
 */

import {
  SALES_MATRIX_HALL_KEYS,
  dopRubFromDailyRow,
  matrixAmountsFromDb,
  planProgressPercent,
} from './salesReportCore.js'
import { readPlanMatrixCellFromForm, roundPlanRub } from './salesPlanMatrixCore.js'
import { projectMonthMetric } from './clubFinanceForecastProjection.js'
import {
  alignMatrixCellFactsToClubGross,
  allocateMatrixForecastsToClubGross,
} from './clubFinanceMatrixReconcileCore.js'

/** @typedef {'pz'|'tz'|'az'} MixHall */
/** @typedef {'nk'|'dk'|'uk'} MixCategory */

export const PURCHASE_MIX_HALLS = /** @type {const} */ ([
  { key: 'pz', label: 'ПЗ' },
  { key: 'tz', label: 'ТЗ' },
  { key: 'az', label: 'АЗ' },
])

export const PURCHASE_MIX_CATEGORIES = /** @type {const} */ ([
  { key: 'nk', label: 'НК' },
  { key: 'dk', label: 'ДК' },
  { key: 'uk', label: 'УК' },
])

/** Доля выручки матрицы от gross, с которой смеси доверяем в итоговом прогнозе. */
export const PURCHASE_MIX_COVERAGE_TRUST = 0.5
/** Базовый вес матрицы при coverage = trust; выше coverage → больше вес (до 0.85). */
export const PURCHASE_MIX_BLEND_WEIGHT = 0.6
export const PURCHASE_MIX_BLEND_WEIGHT_MAX = 0.85

/**
 * @param {string} cellKey
 * @returns {{ hall: MixHall, category: MixCategory } | null}
 */
export function parseMixCellKey(cellKey) {
  const m = /^(pz|tz|az)_(nk|dk|uk)$/.exec(String(cellKey ?? ''))
  if (!m) return null
  return { hall: /** @type {MixHall} */ (m[1]), category: /** @type {MixCategory} */ (m[2]) }
}

/**
 * ₽ ячейки за день из matrix_amounts.
 * @param {Record<string, unknown>} row
 * @param {string} cellKey
 */
export function dailyCellRubFromRow(row, cellKey) {
  const amounts = matrixAmountsFromDb(row?.matrix_amounts)
  return roundPlanRub(Number(amounts?.[cellKey]) || 0)
}

/**
 * шт. ячейки за день из полей отчёта.
 * @param {Record<string, unknown>} row
 * @param {string} cellKey
 */
export function dailyCellCountFromRow(row, cellKey) {
  return Math.max(0, Math.trunc(Number(row?.[cellKey]) || 0))
}

/**
 * Смесь темпа и плана на остаток месяца.
 * @param {{ fact: number, paceForecast: number, planRub: number, category?: string }} opts
 */
export function blendCellForecastWithPlan(opts) {
  const fact = Math.max(0, Number(opts.fact) || 0)
  const paceForecast = Math.max(fact, Number(opts.paceForecast) || 0)
  const planRub = Math.max(0, Number(opts.planRub) || 0)

  if (planRub <= 0) {
    return {
      forecast: roundPlanRub(paceForecast),
      method: 'pace_only',
    }
  }

  // Уже выше плана по темпу — сохраняем перевыполнение.
  if (paceForecast >= planRub) {
    return {
      forecast: roundPlanRub(paceForecast),
      method: 'pace_above_plan',
    }
  }

  // Ниже плана: ДК тянем к плану сильнее (продления из стратегии), НК/УК — ближе к темпу.
  const category = String(opts.category ?? '').toLowerCase()
  const planWeight = category === 'dk' ? 0.65 : 0.45
  const paceWeight = 1 - planWeight
  const blended = paceWeight * paceForecast + planWeight * planRub
  return {
    forecast: roundPlanRub(Math.max(fact, blended)),
    method: category === 'dk' ? 'pace_plan_blend_dk' : 'pace_plan_blend',
  }
}

/**
 * Клубный прогноз = темп по отчётам (profit pace). Матрица — разложение того же итога.
 * planScenarioGross — отдельный оптимистичный сценарий «если тянуться к плану ячеек».
 *
 * @param {{
 *   profitPaceGross: number,
 *   planScenarioGross: number,
 *   factMixGross: number,
 *   factProfitGross: number,
 * }} opts
 */
export function blendClubGrossForecast(opts) {
  const profitF = Math.max(0, Number(opts.profitPaceGross) || 0)
  const planScenario = Math.max(profitF, Number(opts.planScenarioGross) || 0)
  const factMix = Math.max(0, Number(opts.factMixGross) || 0)
  const factProfit = Math.max(0, Number(opts.factProfitGross) || 0)

  const coverage = factProfit > 0 ? factMix / factProfit : factMix > 0 ? 1 : 0
  const trusted = coverage >= PURCHASE_MIX_COVERAGE_TRUST

  return {
    forecastGross: roundPlanRub(profitF),
    planScenarioGross: roundPlanRub(planScenario),
    coverage: roundPlanRub(coverage * 100) / 100,
    trusted,
    method: 'unified_profit_pace',
    mixWeight: trusted ? 1 : 0,
  }
}

/**
 * @param {{
 *   monthRows: Array<Record<string, unknown>>,
 *   year: number,
 *   month: number,
 *   planForm?: Record<string, string>,
 *   closedMonth?: boolean,
 *   factProfitGross?: number,
 *   profitPaceGross?: number,
 * }} input
 */
export function buildPurchaseMixForecast(input) {
  const monthRows = input?.monthRows ?? []
  const year = Number(input?.year)
  const month = Number(input?.month)
  const planForm = input?.planForm ?? {}
  const closedMonth = Boolean(input?.closedMonth)

  /** @type {Array<object>} */
  const cells = []
  /** @type {Record<string, { fact: number, plan: number, forecast: number }>} */
  const byHall = {
    pz: { fact: 0, plan: 0, forecast: 0 },
    tz: { fact: 0, plan: 0, forecast: 0 },
    az: { fact: 0, plan: 0, forecast: 0 },
  }
  /** @type {Record<string, { fact: number, plan: number, forecast: number }>} */
  const byCategory = {
    nk: { fact: 0, plan: 0, forecast: 0 },
    dk: { fact: 0, plan: 0, forecast: 0 },
    uk: { fact: 0, plan: 0, forecast: 0 },
  }

  for (const cellKey of SALES_MATRIX_HALL_KEYS) {
    const parsed = parseMixCellKey(cellKey)
    if (!parsed) continue

    let factRub = 0
    let factCount = 0
    for (const row of monthRows) {
      factRub += dailyCellRubFromRow(row, cellKey)
      factCount += dailyCellCountFromRow(row, cellKey)
    }
    factRub = roundPlanRub(factRub)

    const planCell = readPlanMatrixCellFromForm(planForm, cellKey)
    const planRub = roundPlanRub(planCell.amount)

    let paceForecast = factRub
    let paceMethod = 'closed_month_fact'
    if (!closedMonth) {
      const proj = projectMonthMetric({
        monthRows,
        year,
        month,
        getValue: (row) => dailyCellRubFromRow(row, cellKey),
        roundFn: roundPlanRub,
      })
      paceForecast = proj.forecastTotal
      paceMethod = proj.method
    }

    const planScenario = closedMonth
      ? { forecast: factRub, method: 'closed_month_fact' }
      : blendCellForecastWithPlan({
          fact: factRub,
          paceForecast,
          planRub,
          category: parsed.category,
        })

    const cell = {
      cellKey,
      hall: parsed.hall,
      category: parsed.category,
      label: `${parsed.hall.toUpperCase()}·${parsed.category.toUpperCase()}`,
      factRub,
      factCount,
      planRub,
      planCount: planCell.count,
      paceForecast: roundPlanRub(paceForecast),
      planScenarioRub: planScenario.forecast,
      planScenarioMethod: planScenario.method,
      forecastRub: roundPlanRub(paceForecast),
      blendMethod: 'pace_allocated',
      paceMethod,
    }
    cells.push(cell)
  }

  let factDop = 0
  for (const row of monthRows) {
    factDop += dopRubFromDailyRow(row)
  }
  factDop = roundPlanRub(factDop)

  let dopForecast = factDop
  let dopPaceMethod = 'closed_month_fact'
  if (!closedMonth) {
    const dopProj = projectMonthMetric({
      monthRows,
      year,
      month,
      getValue: (row) => dopRubFromDailyRow(row),
      roundFn: roundPlanRub,
    })
    dopForecast = dopProj.forecastTotal
    dopPaceMethod = dopProj.method
  }

  const factProfitGross = roundPlanRub(Number(input?.factProfitGross) || 0)
  const factMatrixGrossRaw = roundPlanRub(cells.reduce((a, c) => a + c.factRub, 0))
  const profitPaceGross = roundPlanRub(
    closedMonth
      ? factProfitGross || roundPlanRub(factMatrixGrossRaw + factDop)
      : Number(input?.profitPaceGross) || 0,
  )

  const factAligned = alignMatrixCellFactsToClubGross(cells, factProfitGross, factDop)
  const alignedCells = factAligned.cells
  factDop = factAligned.dopFact

  let workingCells = alignedCells
  let dopAlloc = {
    fact: factDop,
    paceForecast: closedMonth ? factDop : dopForecast,
    forecast: closedMonth ? factDop : dopForecast,
  }

  if (!closedMonth && profitPaceGross > 0) {
    const allocated = allocateMatrixForecastsToClubGross({
      cells: alignedCells,
      clubForecastGross: profitPaceGross,
      dopFact: factDop,
      dopPaceForecast: dopForecast,
    })
    workingCells = allocated.cells
    dopAlloc = allocated.dop
  } else if (closedMonth) {
    workingCells = alignedCells.map((c) => ({ ...c, forecastRub: c.factRub }))
  }

  for (const hall of Object.keys(byHall)) {
    byHall[hall].fact = 0
    byHall[hall].plan = 0
    byHall[hall].forecast = 0
    byHall[hall].planScenario = 0
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].fact = 0
    byCategory[cat].plan = 0
    byCategory[cat].forecast = 0
    byCategory[cat].planScenario = 0
  }
  for (const c of workingCells) {
    byHall[c.hall].fact = roundPlanRub(byHall[c.hall].fact + c.factRub)
    byHall[c.hall].plan = roundPlanRub(byHall[c.hall].plan + c.planRub)
    byHall[c.hall].forecast = roundPlanRub(byHall[c.hall].forecast + c.forecastRub)
    byHall[c.hall].planScenario = roundPlanRub(
      byHall[c.hall].planScenario + (c.planScenarioRub || 0),
    )
    byCategory[c.category].fact = roundPlanRub(byCategory[c.category].fact + c.factRub)
    byCategory[c.category].plan = roundPlanRub(byCategory[c.category].plan + c.planRub)
    byCategory[c.category].forecast = roundPlanRub(byCategory[c.category].forecast + c.forecastRub)
    byCategory[c.category].planScenario = roundPlanRub(
      byCategory[c.category].planScenario + (c.planScenarioRub || 0),
    )
  }

  const factMatrixGross = roundPlanRub(workingCells.reduce((a, c) => a + c.factRub, 0))
  const planMixGross = roundPlanRub(workingCells.reduce((a, c) => a + c.planRub, 0))
  const mixMatrixForecastGross = roundPlanRub(workingCells.reduce((a, c) => a + c.forecastRub, 0))
  const planScenarioMatrixGross = roundPlanRub(
    workingCells.reduce((a, c) => a + (c.planScenarioRub || 0), 0),
  )
  /** Матрица 3×3 + доп. продажи — покрытие ближе к club gross. */
  const factMixGross = roundPlanRub(factMatrixGross + factDop)
  const mixForecastGross = roundPlanRub(
    closedMonth ? factMixGross : roundPlanRub(mixMatrixForecastGross + dopAlloc.forecast),
  )
  const planScenarioGross = roundPlanRub(
    closedMonth ? factMixGross : roundPlanRub(planScenarioMatrixGross + dopAlloc.forecast),
  )

  const clubBlend = blendClubGrossForecast({
    profitPaceGross,
    planScenarioGross,
    factMixGross,
    factProfitGross,
  })

  const hallRows = PURCHASE_MIX_HALLS.map((h) => {
    const row = byHall[h.key]
    const planTarget = row.plan
    const fact = row.fact
    const forecast = row.forecast
    const progress = planProgressPercent(closedMonth ? fact : forecast, planTarget)
    return {
      key: h.key,
      label: h.label,
      fact,
      plan: planTarget,
      forecast,
      progressPercent: progress,
      gapRub:
        planTarget > 0 && (closedMonth ? fact : forecast) < planTarget
          ? roundPlanRub(planTarget - (closedMonth ? fact : forecast))
          : 0,
    }
  })

  const categoryRows = PURCHASE_MIX_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    fact: byCategory[c.key].fact,
    plan: byCategory[c.key].plan,
    forecast: byCategory[c.key].forecast,
  }))

  return {
    ok: true,
    closedMonth,
    cells: workingCells,
    byHall,
    byCategory,
    hallRows,
    categoryRows,
    factMixGross,
    factMatrixGross,
    planMixGross,
    mixForecastGross,
    planScenarioGross,
    mixMatrixForecastGross: closedMonth ? factMatrixGross : mixMatrixForecastGross,
    dop: {
      fact: factDop,
      forecast: dopAlloc.forecast,
      paceForecast: dopAlloc.paceForecast,
      paceMethod: dopPaceMethod,
    },
    clubBlend,
    factAligned: factAligned.aligned,
    forecastsReconciled: !closedMonth && profitPaceGross > 0,
  }
}
