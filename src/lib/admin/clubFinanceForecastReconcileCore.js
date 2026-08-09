/**
 * Согласование таблицы направлений с клубным фактом/прогнозом:
 * сумма ₽ по строкам = карточка сверху, без смены клубного итога.
 */

import { planProgressPercent } from './salesReportCore.js'

function roundRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * @param {object} dir
 * @param {number} forecast
 * @param {(progress: number, target: number, amount: number) => object} describeReach
 */
function withForecast(dir, forecast, describeReach) {
  const forecastRevenue = roundRub(Math.max(0, forecast))
  const progress = planProgressPercent(forecastRevenue, dir.planTarget)
  return {
    ...dir,
    forecast: forecastRevenue,
    forecastProgressPercent: progress,
    reach: describeReach(progress, dir.planTarget, forecastRevenue),
    reconciledToClub: true,
  }
}

/**
 * @param {object} dir
 * @param {number} fact
 * @param {boolean} syncForecast
 * @param {(progress: number, target: number, amount: number) => object} describeReach
 */
function withFact(dir, fact, syncForecast, describeReach) {
  const factRevenue = roundRub(Math.max(0, fact))
  const factProgress = planProgressPercent(factRevenue, dir.planTarget)
  if (!syncForecast) {
    return {
      ...dir,
      fact: factRevenue,
      factProgressPercent: factProgress,
    }
  }
  return {
    ...dir,
    fact: factRevenue,
    forecast: factRevenue,
    factProgressPercent: factProgress,
    forecastProgressPercent: factProgress,
    reach: describeReach(factProgress, dir.planTarget, factRevenue),
  }
}

/**
 * Подтянуть факты направлений к club factGross (остаток — в «Доп. продажи» или последнюю ₽-строку).
 * @param {Array<object>} directionRows
 * @param {number} factGross
 * @param {{
 *   syncForecast?: boolean,
 *   describeReach: (progress: number, target: number, amount: number) => object,
 * }} opts
 */
export function alignDirectionFactsToClubGross(directionRows, factGross, opts) {
  const rows = (directionRows ?? []).map((d) => ({ ...d }))
  const describeReach = opts.describeReach
  const syncForecast = opts.syncForecast === true
  const target = roundRub(factGross)
  const revenueIdx = []
  let sum = 0
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].mode !== 'revenue') continue
    revenueIdx.push(i)
    sum += Number(rows[i].fact) || 0
  }
  if (revenueIdx.length === 0) return rows
  const residual = roundRub(target - sum)
  if (Math.abs(residual) < 0.02) return rows

  let absorbIdx = revenueIdx.find((i) => rows[i].key === 'extra')
  if (absorbIdx == null) absorbIdx = revenueIdx[revenueIdx.length - 1]
  const cur = Number(rows[absorbIdx].fact) || 0
  rows[absorbIdx] = withFact(rows[absorbIdx], cur + residual, syncForecast, describeReach)
  return rows
}

/**
 * Разложить клубной прогноз по ₽-направлениям пропорционально их прогнозам (waterfill ≥ факт).
 * Итог клуба не меняется; доли залов сохраняются.
 *
 * @param {Array<object>} directionRows
 * @param {number} targetGross
 * @param {{ describeReach: (progress: number, target: number, amount: number) => object }} opts
 */
export function reconcileDirectionForecastsToClubGross(directionRows, targetGross, opts) {
  const rows = (directionRows ?? []).map((d) => ({ ...d }))
  const describeReach = opts.describeReach
  /** @type {number[]} */
  const revenueIdx = []
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].mode === 'revenue') revenueIdx.push(i)
  }
  if (revenueIdx.length === 0) return rows

  const facts = revenueIdx.map((i) => roundRub(rows[i].fact))
  const forecasts = revenueIdx.map((i) => Math.max(0, Number(rows[i].forecast) || 0))
  const sumFact = roundRub(facts.reduce((a, b) => a + b, 0))
  const target = Math.max(roundRub(targetGross), sumFact)

  /** @type {number[]} */
  const assigned = facts.map(() => null)
  /** @type {Set<number>} */
  const active = new Set(revenueIdx.map((_, k) => k))
  let remaining = target

  while (active.size > 0) {
    let weightSum = 0
    for (const k of active) weightSum += forecasts[k]
    if (weightSum <= 0) {
      const eq = remaining / active.size
      for (const k of active) {
        assigned[k] = roundRub(Math.max(facts[k], eq))
      }
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
          assigned[k] = roundRub(remaining - allocated)
        } else {
          const v = roundRub(remaining * (forecasts[k] / weightSum))
          assigned[k] = v
          allocated = roundRub(allocated + v)
        }
      }
      break
    }

    for (const k of violators) {
      assigned[k] = facts[k]
      remaining = roundRub(remaining - facts[k])
      active.delete(k)
    }
  }

  for (let k = 0; k < revenueIdx.length; k += 1) {
    const i = revenueIdx[k]
    const fc = assigned[k] == null ? facts[k] : assigned[k]
    rows[i] = withForecast(rows[i], Math.max(facts[k], fc), describeReach)
  }

  return fixRevenueForecastRounding(rows, revenueIdx, target, describeReach)
}

/**
 * @param {Array<object>} rows
 * @param {number[]} revenueIdx
 * @param {number} target
 * @param {(progress: number, target: number, amount: number) => object} describeReach
 */
function fixRevenueForecastRounding(rows, revenueIdx, target, describeReach) {
  if (revenueIdx.length === 0) return rows
  let sum = 0
  for (const i of revenueIdx) sum += Number(rows[i].forecast) || 0
  const drift = roundRub(target - sum)
  if (Math.abs(drift) < 0.02) return rows

  /** Снос округления на строку с запасом над фактом, иначе на последнюю. */
  let adjustIdx = revenueIdx[revenueIdx.length - 1]
  for (let k = revenueIdx.length - 1; k >= 0; k -= 1) {
    const i = revenueIdx[k]
    const fact = roundRub(rows[i].fact)
    const fc = roundRub(rows[i].forecast)
    if (fc + drift >= fact - 0.001) {
      adjustIdx = i
      break
    }
  }
  const fact = roundRub(rows[adjustIdx].fact)
  rows[adjustIdx] = withForecast(
    rows[adjustIdx],
    Math.max(fact, roundRub((Number(rows[adjustIdx].forecast) || 0) + drift)),
    describeReach,
  )
  return rows
}

/**
 * Пустую строку «Доп. продажи» не показываем.
 * @param {Array<object>} directionRows
 */
export function pruneEmptyExtraDirection(directionRows) {
  return (directionRows ?? []).filter((d) => {
    if (d.key !== 'extra') return true
    return (
      (Number(d.planTarget) || 0) > 0 ||
      (Number(d.fact) || 0) > 0 ||
      (Number(d.forecast) || 0) > 0
    )
  })
}

/**
 * Сумма прогнозов ₽-направлений (для verify).
 * @param {Array<object>} directionRows
 */
export function sumRevenueDirectionForecast(directionRows) {
  return roundRub(
    (directionRows ?? [])
      .filter((d) => d.mode === 'revenue')
      .reduce((s, d) => s + (Number(d.forecast) || 0), 0),
  )
}

/**
 * Сумма фактов ₽-направлений (для verify).
 * @param {Array<object>} directionRows
 */
export function sumRevenueDirectionFact(directionRows) {
  return roundRub(
    (directionRows ?? [])
      .filter((d) => d.mode === 'revenue')
      .reduce((s, d) => s + (Number(d.fact) || 0), 0),
  )
}

/**
 * Сумма планов по строкам таблицы (включая «Неразнесено»).
 * @param {Array<object>} directionRows
 */
export function sumDirectionPlanTargets(directionRows) {
  return roundRub(
    (directionRows ?? []).reduce((s, d) => s + (Number(d.planTarget) || 0), 0),
  )
}

const PLAN_MONEY_EPS = 0.02

/**
 * Если сумма планов направлений ниже финала — строка «Неразнесено» (только план).
 * Добавлять после reconcile факта/прогноза, чтобы не участвовала в раскладке ₽.
 *
 * @param {Array<object>} directionRows
 * @param {number} level3
 * @param {(progress: number, target: number, amount: number) => object} describeReach
 */
export function appendUnallocatedPlanRow(directionRows, level3, describeReach) {
  const rows = (directionRows ?? []).filter((d) => d.key !== 'unallocated')
  const target = roundRub(level3)
  if (target <= 0) return rows

  const allocated = sumDirectionPlanTargets(rows)
  const shortfall = roundRub(Math.max(0, target - allocated))
  if (shortfall < PLAN_MONEY_EPS) return rows

  const progress = planProgressPercent(0, shortfall)
  return [
    ...rows,
    {
      key: 'unallocated',
      label: 'Неразнесено',
      mode: 'revenue',
      planTarget: shortfall,
      fact: 0,
      forecast: 0,
      factProgressPercent: progress,
      forecastProgressPercent: progress,
      unallocatedPlan: true,
      reach: describeReach(progress, shortfall, 0),
    },
  ]
}

/**
 * Итоги таблицы направлений + сверка с клубными KPI.
 *
 * @param {{
 *   directions: Array<object>,
 *   level3: number,
 *   factGross: number,
 *   forecastGross: number,
 *   closedMonth?: boolean,
 * }} opts
 */
export function buildDirectionTotals(opts) {
  const directions = opts.directions ?? []
  const level3 = roundRub(opts.level3)
  const factGross = roundRub(opts.factGross)
  const forecastGross = roundRub(opts.forecastGross)
  const closedMonth = opts.closedMonth === true

  const planSum = sumDirectionPlanTargets(directions)
  const factSum = sumRevenueDirectionFact(directions)
  const forecastSum = sumRevenueDirectionForecast(directions)
  const clubAmount = closedMonth ? factGross : forecastGross
  const clubGapRub = level3 > 0 ? roundRub(Math.max(0, level3 - clubAmount)) : 0
  const planVsLevel3 = level3 > 0 ? roundRub(planSum - level3) : 0
  const unallocatedRub = roundRub(
    Number(directions.find((d) => d.key === 'unallocated')?.planTarget) || 0,
  )
  const directionsBelow = unallocatedRub >= PLAN_MONEY_EPS
  const directionsAbove = planVsLevel3 > PLAN_MONEY_EPS

  let planNoteRu = ''
  if (directionsBelow) {
    planNoteRu = `В плане не разнесено ${formatRubPlain(unallocatedRub)} до финала.`
  } else if (directionsAbove) {
    planNoteRu = `План направлений выше финала на ${formatRubPlain(planVsLevel3)}.`
  }

  return {
    planSum,
    factSum,
    forecastSum,
    clubGapRub,
    planVsLevel3,
    unallocatedRub,
    directionsBelow,
    directionsAbove,
    planNoteRu,
    factMatchesClub: Math.abs(factSum - factGross) < PLAN_MONEY_EPS,
    forecastMatchesClub: Math.abs(forecastSum - forecastGross) < PLAN_MONEY_EPS,
    planMatchesLevel3:
      level3 <= 0 || directionsAbove || Math.abs(planSum - level3) < PLAN_MONEY_EPS,
  }
}

/** @param {number} n */
function formatRubPlain(n) {
  const rounded = Math.round(Number(n) || 0)
  return `${new Intl.NumberFormat('ru-RU').format(rounded)} ₽`
}
