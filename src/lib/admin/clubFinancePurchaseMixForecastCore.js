/**
 * Прогноз покупок по матрице ПЗ/ТЗ/АЗ × НК/ДК/УК:
 * факт месяца + темп (будни/выходные) + допущения плана (шт × ср. чек).
 */

import {
  SALES_MATRIX_HALL_KEYS,
  matrixAmountsFromDb,
  planProgressPercent,
} from './salesReportCore.js'
import { readPlanMatrixCellFromForm, roundPlanRub } from './salesPlanMatrixCore.js'
import { projectMonthMetric } from './clubFinanceForecastProjection.js'

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
 * Итоговый gross: смесь матрицы и классического темпа profit.
 * @param {{
 *   mixForecastGross: number,
 *   profitPaceGross: number,
 *   factMixGross: number,
 *   factProfitGross: number,
 * }} opts
 */
export function blendClubGrossForecast(opts) {
  const mixF = Math.max(0, Number(opts.mixForecastGross) || 0)
  const profitF = Math.max(0, Number(opts.profitPaceGross) || 0)
  const factMix = Math.max(0, Number(opts.factMixGross) || 0)
  const factProfit = Math.max(0, Number(opts.factProfitGross) || 0)

  const coverage = factProfit > 0 ? factMix / factProfit : factMix > 0 ? 1 : 0
  const trusted = coverage >= PURCHASE_MIX_COVERAGE_TRUST

  if (!trusted || mixF <= 0) {
    return {
      forecastGross: roundPlanRub(profitF),
      coverage: roundPlanRub(coverage * 100) / 100,
      trusted: false,
      method: 'profit_pace',
      mixWeight: 0,
    }
  }

  // Чем полнее заполнены суммы ячеек, тем сильнее матрица в общем прогнозе.
  const span = Math.max(0.01, 1 - PURCHASE_MIX_COVERAGE_TRUST)
  const t = Math.min(1, Math.max(0, (coverage - PURCHASE_MIX_COVERAGE_TRUST) / span))
  const w = roundPlanRub(
    PURCHASE_MIX_BLEND_WEIGHT + t * (PURCHASE_MIX_BLEND_WEIGHT_MAX - PURCHASE_MIX_BLEND_WEIGHT),
  )
  const blended = w * mixF + (1 - w) * profitF
  return {
    forecastGross: roundPlanRub(blended),
    coverage: roundPlanRub(coverage * 100) / 100,
    trusted: true,
    method: 'mix_and_profit_blend',
    mixWeight: w,
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

    const blend = closedMonth
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
      forecastRub: blend.forecast,
      blendMethod: blend.method,
      paceMethod,
    }
    cells.push(cell)

    byHall[parsed.hall].fact = roundPlanRub(byHall[parsed.hall].fact + factRub)
    byHall[parsed.hall].plan = roundPlanRub(byHall[parsed.hall].plan + planRub)
    byHall[parsed.hall].forecast = roundPlanRub(byHall[parsed.hall].forecast + blend.forecast)

    byCategory[parsed.category].fact = roundPlanRub(byCategory[parsed.category].fact + factRub)
    byCategory[parsed.category].plan = roundPlanRub(byCategory[parsed.category].plan + planRub)
    byCategory[parsed.category].forecast = roundPlanRub(
      byCategory[parsed.category].forecast + blend.forecast,
    )
  }

  const factMixGross = roundPlanRub(cells.reduce((a, c) => a + c.factRub, 0))
  const planMixGross = roundPlanRub(cells.reduce((a, c) => a + c.planRub, 0))
  const mixForecastGross = roundPlanRub(cells.reduce((a, c) => a + c.forecastRub, 0))

  const clubBlend = blendClubGrossForecast({
    mixForecastGross: closedMonth ? factMixGross : mixForecastGross,
    profitPaceGross: closedMonth
      ? Number(input?.factProfitGross) || factMixGross
      : Number(input?.profitPaceGross) || mixForecastGross,
    factMixGross,
    factProfitGross: Number(input?.factProfitGross) || 0,
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
    cells,
    byHall,
    byCategory,
    hallRows,
    categoryRows,
    factMixGross,
    planMixGross,
    mixForecastGross: closedMonth ? factMixGross : mixForecastGross,
    clubBlend,
  }
}
