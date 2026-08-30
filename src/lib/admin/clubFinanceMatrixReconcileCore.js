/**
 * Согласование матрицы 3×3 с клубным фактом и прогнозом:
 * сумма ячеек + доп = карточка клуба (факт и прогноз по темпу отчётов).
 */

function roundRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

const EPS = 0.02

/**
 * Waterfill: разложить target по весам pace, не ниже fact.
 * @param {Array<{ fact: number, pace: number }>} items
 * @param {number} target
 */
export function allocateForecastsByPaceWeights(items, target) {
  const list = (items ?? []).map((it) => ({
    fact: roundRub(Math.max(0, it.fact)),
    pace: Math.max(0, Number(it.pace) || 0),
  }))
  const goal = roundRub(target)
  if (list.length === 0) return []
  if (goal <= 0) return list.map((it) => ({ ...it, forecast: it.fact }))

  const sumFact = roundRub(list.reduce((s, it) => s + it.fact, 0))
  const effectiveTarget = Math.max(goal, sumFact)

  /** @type {(number|null)[]} */
  const assigned = list.map(() => null)
  /** @type {Set<number>} */
  const active = new Set(list.map((_, i) => i))
  let remaining = effectiveTarget

  while (active.size > 0) {
    let weightSum = 0
    for (const i of active) weightSum += list[i].pace
    if (weightSum <= 0) {
      const eq = remaining / active.size
      for (const i of active) assigned[i] = roundRub(Math.max(list[i].fact, eq))
      break
    }

    /** @type {number[]} */
    const violators = []
    for (const i of active) {
      const trial = remaining * (list[i].pace / weightSum)
      if (trial + 1e-9 < list[i].fact) violators.push(i)
    }

    if (violators.length === 0) {
      const keys = [...active]
      let allocated = 0
      for (let j = 0; j < keys.length; j += 1) {
        const i = keys[j]
        if (j === keys.length - 1) {
          assigned[i] = roundRub(remaining - allocated)
        } else {
          const v = roundRub(remaining * (list[i].pace / weightSum))
          assigned[i] = v
          allocated = roundRub(allocated + v)
        }
      }
      break
    }

    for (const i of violators) {
      assigned[i] = list[i].fact
      remaining = roundRub(remaining - list[i].fact)
      active.delete(i)
    }
  }

  return list.map((it, i) => ({
    ...it,
    forecast: roundRub(Math.max(it.fact, assigned[i] ?? it.fact)),
  }))
}

/**
 * Подтянуть сумму фактов ячеек к club factGross (остаток — в dop или последнюю ячейку).
 * @param {Array<{ factRub: number, cellKey?: string }>} cells
 * @param {number} clubFactGross
 * @param {number} dopFact
 */
export function alignMatrixCellFactsToClubGross(cells, clubFactGross, dopFact) {
  const rows = (cells ?? []).map((c) => ({ ...c, factRub: roundRub(c.factRub) }))
  const target = roundRub(clubFactGross)
  const dop = roundRub(dopFact)
  const matrixSum = roundRub(rows.reduce((s, c) => s + (Number(c.factRub) || 0), 0))
  const residual = roundRub(target - matrixSum - dop)
  if (Math.abs(residual) < EPS) {
    return { cells: rows, dopFact: dop, aligned: false }
  }

  // Неразложенная выручка (profit_nk/dk/uk без matrix_amounts) — в dop, не в случайную ячейку.
  let nextDop = roundRub(dop + residual)
  if (nextDop + EPS < 0 && rows.length > 0) {
    const absorbIdx = rows.length - 1
    const trimmed = rows.map((c, i) =>
      i === absorbIdx
        ? { ...c, factRub: roundRub(Math.max(0, (Number(c.factRub) || 0) + nextDop)), factAligned: true }
        : c,
    )
    nextDop = 0
    return { cells: trimmed, dopFact: nextDop, aligned: true }
  }

  return { cells: rows, dopFact: Math.max(0, nextDop), aligned: true }
}

/**
 * Прогноз матрицы = доли clubForecastGross по темпам ячеек (+ dop).
 * @param {{
 *   cells: Array<{ factRub: number, paceForecast: number }>,
 *   clubForecastGross: number,
 *   dopFact: number,
 *   dopPaceForecast: number,
 * }} opts
 */
export function allocateMatrixForecastsToClubGross(opts) {
  const clubForecast = roundRub(opts.clubForecastGross)
  const dopPace = Math.max(0, Number(opts.dopPaceForecast) || 0)
  const dopFact = roundRub(opts.dopFact)

  const cellItems = (opts.cells ?? []).map((c) => ({
    fact: roundRub(c.factRub),
    pace: Math.max(0, Number(c.paceForecast) || 0),
  }))

  const allItems = [...cellItems, { fact: dopFact, pace: dopPace }]
  const allocated = allocateForecastsByPaceWeights(allItems, clubForecast)

  const dopAlloc = allocated[allocated.length - 1]
  const cellAlloc = allocated.slice(0, -1)

  return {
    cells: cellAlloc.map((a, i) => ({
      ...opts.cells[i],
      forecastRub: a.forecast,
      forecastAllocated: true,
    })),
    dop: {
      fact: dopFact,
      paceForecast: dopPace,
      forecast: dopAlloc.forecast,
    },
    mixForecastGross: clubForecast,
    sumCheck: roundRub(
      cellAlloc.reduce((s, a) => s + a.forecast, 0) + dopAlloc.forecast,
    ),
  }
}
