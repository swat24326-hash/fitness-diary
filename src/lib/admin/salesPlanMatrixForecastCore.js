/**
 * Прогноз ячеек матрицы плана (ПЗ/ТЗ/АЗ × НК/ДК/УК).
 * Тот же движок, что смесь покупок: будни/выходные + тяга к плану (ДК сильнее).
 */

import { projectMonthMetric } from './clubFinanceForecastProjection.js'
import {
  blendCellForecastWithPlan,
  dailyCellCountFromRow,
  dailyCellRubFromRow,
} from './clubFinancePurchaseMixForecastCore.js'
import { roundPlanRub } from './salesPlanMatrixCore.js'

/**
 * Линейный прогноз ₽ от доли календаря (fallback без year/month).
 * @param {number} factAmount
 * @param {{ month_relation?: string, expected_plan_progress_pct?: number } | null | undefined} calendar
 */
export function forecastPlanMatrixAmountLinear(factAmount, calendar) {
  const relation = calendar?.month_relation ?? 'current'
  const fact = roundPlanRub(factAmount)
  if (relation === 'past') return fact
  if (relation !== 'current') return fact
  const elapsed = Number(calendar?.expected_plan_progress_pct) || 0
  if (elapsed <= 0) return fact
  return roundPlanRub((fact / elapsed) * 100)
}

/**
 * Линейный прогноз шт от доли календаря (fallback без year/month).
 * @param {number} factCount
 * @param {{ month_relation?: string, expected_plan_progress_pct?: number } | null | undefined} calendar
 */
export function forecastPlanMatrixCountLinear(factCount, calendar) {
  const relation = calendar?.month_relation ?? 'current'
  const fact = Math.trunc(Number(factCount) || 0)
  if (relation === 'past') return fact
  if (relation !== 'current') return fact
  const elapsed = Number(calendar?.expected_plan_progress_pct) || 0
  if (elapsed <= 0) return fact
  return Math.max(0, Math.round((fact / elapsed) * 100))
}

/**
 * @param {{
 *   monthRows: Array<Record<string, unknown>>,
 *   year: number,
 *   month: number,
 *   cellKey: string,
 *   factAmount: number,
 *   planAmount: number,
 *   category: string,
 *   calendar?: { month_relation?: string } | null,
 * }} opts
 */
export function forecastPlanMatrixCellAmount(opts) {
  const relation = opts.calendar?.month_relation ?? 'current'
  const fact = roundPlanRub(opts.factAmount)
  if (relation === 'past') return { amount: fact, method: 'closed_month_fact' }
  if (relation !== 'current') return { amount: fact, method: 'not_current' }

  const year = Number(opts.year)
  const month = Number(opts.month)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return {
      amount: forecastPlanMatrixAmountLinear(fact, opts.calendar),
      method: 'linear_calendar_fallback',
    }
  }

  const proj = projectMonthMetric({
    monthRows: opts.monthRows ?? [],
    year,
    month,
    getValue: (row) => dailyCellRubFromRow(row, opts.cellKey),
    roundFn: roundPlanRub,
  })
  const blend = blendCellForecastWithPlan({
    fact,
    paceForecast: proj.forecastTotal,
    planRub: opts.planAmount,
    category: opts.category,
  })
  return {
    amount: blend.forecast,
    method: blend.method,
    paceMethod: proj.method,
  }
}

/**
 * @param {{
 *   monthRows: Array<Record<string, unknown>>,
 *   year: number,
 *   month: number,
 *   cellKey: string,
 *   factCount: number,
 *   calendar?: { month_relation?: string } | null,
 * }} opts
 */
export function forecastPlanMatrixCellCount(opts) {
  const relation = opts.calendar?.month_relation ?? 'current'
  const fact = Math.trunc(Number(opts.factCount) || 0)
  if (relation === 'past') return { count: fact, method: 'closed_month_fact' }
  if (relation !== 'current') return { count: fact, method: 'not_current' }

  const year = Number(opts.year)
  const month = Number(opts.month)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return {
      count: forecastPlanMatrixCountLinear(fact, opts.calendar),
      method: 'linear_calendar_fallback',
    }
  }

  const proj = projectMonthMetric({
    monthRows: opts.monthRows ?? [],
    year,
    month,
    getValue: (row) => dailyCellCountFromRow(row, opts.cellKey),
    roundFn: (n) => Math.max(0, Math.round(Number(n) || 0)),
  })
  return {
    count: Math.max(fact, proj.forecastTotal),
    method: proj.method,
  }
}

/**
 * Шт. из единого прогноза ₽ (тот же контур, что карточка клуба).
 * @param {number} amount
 * @param {number} factCount
 * @param {number} factAmount
 * @param {number} planAvg
 */
export function forecastCountFromUnifiedAmount(amount, factCount, factAmount, planAvg) {
  const amt = roundPlanRub(amount)
  const fact = Math.trunc(Number(factCount) || 0)
  const avg =
    fact > 0 && factAmount > 0
      ? roundPlanRub(factAmount / fact)
      : roundPlanRub(Number(planAvg) || 0)
  if (avg > 0 && amt > 0) {
    return {
      count: Math.max(fact, Math.round(amt / avg)),
      method: 'unified_club_pace',
    }
  }
  return null
}

/**
 * Растянуть прогнозы ₽ ячеек зала так, чтобы сумма = цель зала (как в таблице направлений).
 * @param {Array<{ hall?: string, fact?: { amount?: number }, forecast?: { amount?: number } }>} rows
 * @param {Record<string, number> | null | undefined} hallTargets
 */
export function scaleMatrixForecastAmountsToHallTargets(rows, hallTargets) {
  if (!hallTargets || typeof hallTargets !== 'object') return rows
  const list = (rows ?? []).map((r) => ({
    ...r,
    forecast: { ...(r.forecast ?? {}) },
  }))

  for (const hall of ['pz', 'tz', 'az']) {
    const target = roundPlanRub(hallTargets[hall])
    if (!(target > 0)) continue
    const idxs = []
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].hall === hall) idxs.push(i)
    }
    if (!idxs.length) continue

    const facts = idxs.map((i) => roundPlanRub(list[i].fact?.amount))
    const forecasts = idxs.map((i) => Math.max(0, Number(list[i].forecast?.amount) || 0))
    const sumFact = roundPlanRub(facts.reduce((a, b) => a + b, 0))
    /** Ниже факта не опускаем — если факт уже выше цели зала, нормирование пропускаем. */
    if (sumFact > target + 0.02) continue
    const goal = target

    /** @type {number[]} */
    const assigned = facts.map(() => null)
    /** @type {Set<number>} */
    const active = new Set(idxs.map((_, k) => k))
    let remaining = goal

    while (active.size > 0) {
      let weightSum = 0
      for (const k of active) weightSum += forecasts[k]
      if (weightSum <= 0) {
        const eq = remaining / active.size
        for (const k of active) assigned[k] = roundPlanRub(Math.max(facts[k], eq))
        break
      }

      /** @type {number[]} */
      const violators = []
      for (const k of active) {
        const trial = remaining * (forecasts[k] / weightSum)
        if (trial + 1e-9 < facts[k]) violators.push(k)
      }
      if (violators.length === 0) {
        const keys = [...active]
        let allocated = 0
        for (let i = 0; i < keys.length; i += 1) {
          const k = keys[i]
          if (i === keys.length - 1) {
            assigned[k] = roundPlanRub(remaining - allocated)
          } else {
            const v = roundPlanRub(remaining * (forecasts[k] / weightSum))
            assigned[k] = v
            allocated = roundPlanRub(allocated + v)
          }
        }
        break
      }
      for (const k of violators) {
        assigned[k] = facts[k]
        remaining = roundPlanRub(remaining - facts[k])
        active.delete(k)
      }
    }

    for (let k = 0; k < idxs.length; k += 1) {
      const i = idxs[k]
      const next = assigned[k] == null ? facts[k] : assigned[k]
      list[i].forecast.amount = roundPlanRub(Math.max(facts[k], next))
      list[i].forecast.scaled_to_hall = true
    }

    let sum = 0
    for (const i of idxs) sum += Number(list[i].forecast.amount) || 0
    const drift = roundPlanRub(goal - sum)
    if (Math.abs(drift) >= 0.02) {
      let adjustIdx = idxs[idxs.length - 1]
      for (let k = idxs.length - 1; k >= 0; k -= 1) {
        const i = idxs[k]
        const fact = roundPlanRub(list[i].fact?.amount)
        const fc = roundPlanRub(list[i].forecast.amount)
        if (fc + drift >= fact - 0.001) {
          adjustIdx = i
          break
        }
      }
      const fact = roundPlanRub(list[adjustIdx].fact?.amount)
      list[adjustIdx].forecast.amount = roundPlanRub(
        Math.max(fact, (Number(list[adjustIdx].forecast.amount) || 0) + drift),
      )
    }
  }

  return list
}
