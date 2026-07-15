/** Сравнение плана по ячейкам матрицы с фактом из дневных отчётов. */

import {
  planProgressPercent,
  SALES_MATRIX_COLS,
  SALES_MATRIX_HALL_ROWS,
  sumMatrix3x3AmountsFromDailyRows,
  matrixAmountsFromDb,
} from './salesReportCore.js'
import {
  hasPlanMatrixData,
  normalizePlanMatrixFromDb,
  PLAN_MATRIX_HALL_CELL_KEYS,
  roundPlanRub,
} from './salesPlanMatrixCore.js'

/** Допуск от календарного темпа, % (как в ИСКРЕ по направлениям). */
export const PLAN_MATRIX_PACE_SLACK_PCT = 8

/** @param {'pz'|'tz'|'az'} hall @param {'nk'|'dk'|'uk'} col */
export function planMatrixCellLabel(hall, col) {
  const row = SALES_MATRIX_HALL_ROWS.find((r) => r.key === hall)
  const colDef = SALES_MATRIX_COLS.find((c) => c.suffix === col)
  return `${row?.label ?? hall} ${colDef?.label ?? col}`
}

/** @param {Array<Record<string, unknown>>} rows */
function sumMatrix3x3CountsFromDailyRows(rows) {
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

/** @param {number} amount @param {number} count */
function factAvgCheck(amount, count) {
  if (count <= 0 || amount <= 0) return null
  return roundPlanRub(amount / count)
}

/**
 * Прогноз суммы к концу месяца (линейно от факта и календаря).
 * @param {number} factAmount
 * @param {{ month_relation?: string, expected_plan_progress_pct?: number } | null | undefined} calendar
 */
export function forecastPlanMatrixAmount(factAmount, calendar) {
  const relation = calendar?.month_relation ?? 'current'
  const fact = roundPlanRub(factAmount)
  if (relation === 'past') return fact
  if (relation !== 'current') return fact
  const elapsed = Number(calendar?.expected_plan_progress_pct) || 0
  if (elapsed <= 0) return fact
  return roundPlanRub((fact / elapsed) * 100)
}

/**
 * Прогноз количества к концу месяца (линейно от факта и календаря).
 * @param {number} factCount
 * @param {{ month_relation?: string, expected_plan_progress_pct?: number } | null | undefined} calendar
 */
export function forecastPlanMatrixCount(factCount, calendar) {
  const relation = calendar?.month_relation ?? 'current'
  const fact = Math.trunc(Number(factCount) || 0)
  if (relation === 'past') return fact
  if (relation !== 'current') return fact
  const elapsed = Number(calendar?.expected_plan_progress_pct) || 0
  if (elapsed <= 0) return fact
  return Math.max(0, Math.round((fact / elapsed) * 100))
}

/**
 * Продажи по дням месяца для одной ячейки матрицы (pz_nk, tz_dk, …).
 * @param {Array<Record<string, unknown>>} monthRows
 * @param {number} year
 * @param {number} month 1–12
 * @param {string} cellKey
 */
export function buildPlanMatrixCellDailySeries(monthRows, year, month, cellKey) {
  const y = Number(year)
  const m = Number(month)
  const key = String(cellKey ?? '').trim()
  if (!key) return []

  const lastDay = new Date(y, m, 0).getDate()
  /** @type {Map<string, { count: number, amount: number }>} */
  const byDate = new Map()

  for (const r of monthRows ?? []) {
    const iso = String(r.report_date ?? '').slice(0, 10)
    if (!iso) continue
    const count = Math.trunc(Number(r[key]) || 0)
    const amounts = matrixAmountsFromDb(r.matrix_amounts)
    const amount = roundPlanRub(Number(amounts[key]) || 0)
    byDate.set(iso, { count, amount })
  }

  /** @type {Array<{ date: string, count: number | null, amount: number | null, hasReport: boolean }>} */
  const series = []
  for (let day = 1; day <= lastDay; day += 1) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const cell = byDate.get(iso)
    series.push({
      date: iso,
      count: cell != null ? cell.count : null,
      amount: cell != null ? cell.amount : null,
      hasReport: cell != null,
    })
  }
  return series
}

/**
 * Сопоставимый индекс по дням: 100% = дневная норма (план ÷ дней месяца или равномерный факт).
 * @param {Array<{ date: string, count: number | null, amount: number | null, hasReport: boolean }>} dailySeries
 * @param {{
 *   daysInMonth?: number,
 *   plan?: { count?: number, amount?: number, avg_check?: number },
 * }} opts
 */
export function buildSegmentDailyComparableSeries(dailySeries, opts = {}) {
  const daysInMonth = Number(opts.daysInMonth) || dailySeries.length || 30
  const planCount = Math.trunc(Number(opts.plan?.count) || 0)
  const planAmount = roundPlanRub(Number(opts.plan?.amount) || 0)
  const planAvg = roundPlanRub(Number(opts.plan?.avg_check) || 0)

  const reported = (dailySeries ?? []).filter((d) => d.hasReport)
  const monthCount = reported.reduce((s, d) => s + (Number(d.count) || 0), 0)
  const monthAmount = roundPlanRub(reported.reduce((s, d) => s + (Number(d.amount) || 0), 0))

  const normCount =
    planCount > 0 ? planCount / daysInMonth : monthCount > 0 ? monthCount / daysInMonth : 0
  const normAmount =
    planAmount > 0 ? planAmount / daysInMonth : monthAmount > 0 ? monthAmount / daysInMonth : 0
  const normAvg = planAvg > 0 ? planAvg : 0
  const normBasis = planCount > 0 || planAmount > 0 || planAvg > 0 ? 'plan' : 'flat_month'

  return (dailySeries ?? []).map((d) => {
    if (!d.hasReport) {
      return {
        date: d.date,
        hasReport: false,
        count: null,
        amount: null,
        avg: null,
        index_count: null,
        index_amount: null,
        index_avg: null,
        norm_basis: normBasis,
      }
    }
    const count = Math.trunc(Number(d.count) || 0)
    const amount = roundPlanRub(Number(d.amount) || 0)
    const avg = count > 0 ? roundPlanRub(amount / count) : 0
    return {
      date: d.date,
      hasReport: true,
      count,
      amount,
      avg,
      index_count: normCount > 0 ? planProgressPercent(count, normCount) : null,
      index_amount: normAmount > 0 ? planProgressPercent(amount, normAmount) : null,
      index_avg: normAvg > 0 ? planProgressPercent(avg, normAvg) : null,
      norm_basis: normBasis,
    }
  })
}

/**
 * Горизонтальные линии «план на день» для графика фактов по сегменту.
 * @param {{ count?: number, amount?: number, avg_check?: number }} [plan]
 * @param {number} [daysInMonth]
 */
export function resolveSegmentChartPlanLines(plan, daysInMonth) {
  const days = Math.max(1, Number(daysInMonth) || 30)
  const planCount = Math.trunc(Number(plan?.count) || 0)
  const planAmount = roundPlanRub(Number(plan?.amount) || 0)
  const planAvg = roundPlanRub(Number(plan?.avg_check) || 0)
  const amount = planAmount > 0 ? roundPlanRub(planAmount / days) : null
  const count = planCount > 0 ? planCount / days : null
  const avg = planAvg > 0 ? planAvg : null
  return {
    hasPlan: amount != null || count != null || avg != null,
    amount,
    count,
    avg,
    daysInMonth: days,
    monthAmount: planAmount,
    monthCount: planCount,
    monthAvg: planAvg,
  }
}

/**
 * @param {{
 *   plan?: { count?: number, avg_check?: number, amount?: number },
 *   fact?: { count?: number, avg_check?: number | null, amount?: number },
 *   count_progress_pct?: number,
 *   amount_progress_pct?: number,
 *   avg_gap_rub?: number | null,
 *   pace?: { on_pace?: boolean },
 * }} row
 * @param {{ month_relation?: string, expected_plan_progress_pct?: number } | null | undefined} calendar
 */
export function resolvePlanMatrixCellStatus(row, calendar) {
  const relation = calendar?.month_relation ?? 'current'
  const elapsedPct = relation === 'current' ? Number(calendar?.expected_plan_progress_pct) || 0 : relation === 'past' ? 100 : 0

  const planAmount = Number(row.plan?.amount) || 0
  const factAmount = Number(row.fact?.amount) || 0
  const countPct = Number(row.count_progress_pct) || 0
  const amountPct = Number(row.amount_progress_pct) || 0

  if (planAmount <= 0) {
    return {
      status: 'muted',
      label: '—',
      title: 'План по ячейке не задан',
      forecast_amount: 0,
      forecast_pct: 0,
    }
  }

  const forecastAmount = forecastPlanMatrixAmount(factAmount, calendar)
  const forecastPct = planProgressPercent(forecastAmount, planAmount)
  const forecastOk = forecastPct >= 99.5

  const paceThreshold = relation === 'past' ? 95 : Math.max(5, elapsedPct - PLAN_MATRIX_PACE_SLACK_PCT)
  const countOk =
    relation === 'future' ? countPct >= 0 : Boolean(row.pace?.on_pace) || countPct >= paceThreshold
  const amountOk = relation === 'future' ? amountPct >= 0 : amountPct >= paceThreshold

  const avgGap = row.avg_gap_rub
  const avgOk = avgGap == null || Number(avgGap) >= -0.01 || factAmount <= 0

  const ok = countOk && amountOk && forecastOk && avgOk

  /** @type {string[]} */
  const lagReasons = []
  if (!countOk) lagReasons.push('объём отстаёт от темпа месяца')
  if (!amountOk) lagReasons.push('сумма ниже ожидаемой на сегодня')
  if (!forecastOk) lagReasons.push('прогноз к концу месяца не дотягивает до плана')
  if (!avgOk) lagReasons.push('средний чек ниже плана')

  const title = ok
    ? 'В темпе и по плану: объём и сумма в норме, прогноз к концу месяца достигает плана.'
    : lagReasons.length
      ? `Отставание: ${lagReasons.join('; ')}.`
      : 'Отставание по плану.'

  return {
    status: ok ? 'ok' : 'lag',
    label: ok ? 'В темпе' : 'Отстаём',
    title,
    forecast_amount: forecastAmount,
    forecast_pct: forecastPct,
    count_on_pace: countOk,
    amount_on_pace: amountOk,
    forecast_ok: forecastOk,
    avg_ok: avgOk,
  }
}

/**
 * @param {{
 *   monthRows?: Array<Record<string, unknown>>,
 *   planMatrix?: unknown,
 *   calendarContext?: { month_relation?: string, expected_plan_progress_pct?: number } | null,
 * }} opts
 */
export function buildPlanMatrixComparison(opts) {
  const monthRows = opts.monthRows ?? []
  const planMatrix = normalizePlanMatrixFromDb(opts.planMatrix)
  const calendar = opts.calendarContext ?? null

  if (!hasPlanMatrixData(planMatrix)) {
    return {
      has_plan_matrix: false,
      rows: [],
      volume_lag: [],
      avg_lag: [],
      summary_ru: '',
    }
  }

  const factCounts = sumMatrix3x3CountsFromDailyRows(monthRows)
  const factAmounts = sumMatrix3x3AmountsFromDailyRows(monthRows)

  const isCurrentMonth = calendar?.month_relation === 'current'
  const isPastMonth = calendar?.month_relation === 'past'
  const elapsedPct = isCurrentMonth ? Number(calendar?.expected_plan_progress_pct) || 0 : isPastMonth ? 100 : 0
  const paceSlack = isCurrentMonth ? 0.5 : 0

  /** @type {Array<Record<string, unknown>>} */
  const rows = []
  /** @type {Array<Record<string, unknown>>} */
  const volumeLag = []
  /** @type {Array<Record<string, unknown>>} */
  const avgLag = []

  for (const cellKey of PLAN_MATRIX_HALL_CELL_KEYS) {
    const planCell = planMatrix[cellKey]
    if (!planCell) continue

    const [hall, col] = /** @type {['pz'|'tz'|'az', 'nk'|'dk'|'uk']} */ (cellKey.split('_'))
    const planCount = planCell.count
    const planAvg = planCell.avg_check
    const planAmount = roundPlanRub(planCount * planAvg)

    const factCount = Math.trunc(Number(factCounts[cellKey]) || 0)
    const factAmount = roundPlanRub(Number(factAmounts[cellKey]) || 0)
    const factAvg = factAvgCheck(factAmount, factCount)

    const countGap = factCount - planCount
    const countProgressPct = planProgressPercent(factCount, planCount)
    const avgGapRub = factAvg != null ? roundPlanRub(factAvg - planAvg) : null
    const amountProgressPct = planProgressPercent(factAmount, planAmount)

    const expectedCount =
      isCurrentMonth && elapsedPct > 0
        ? Math.max(0, Math.round((planCount * elapsedPct) / 100))
        : planCount
    const onPace = !isCurrentMonth || factCount + paceSlack >= expectedCount

    const forecastCount = forecastPlanMatrixCount(factCount, calendar)
    const forecastAmount = forecastPlanMatrixAmount(factAmount, calendar)

    const row = {
      cellKey,
      hall,
      col,
      label: planMatrixCellLabel(hall, col),
      plan: { count: planCount, avg_check: planAvg, amount: planAmount },
      fact: { count: factCount, avg_check: factAvg, amount: factAmount },
      forecast: {
        count: forecastCount,
        amount: forecastAmount,
        count_progress_pct: planProgressPercent(forecastCount, planCount),
        amount_progress_pct: planProgressPercent(forecastAmount, planAmount),
      },
      count_gap: countGap,
      count_progress_pct: countProgressPct,
      avg_gap_rub: avgGapRub,
      amount_progress_pct: amountProgressPct,
      pace: { expected_count: expectedCount, on_pace: onPace },
    }
    row.status = resolvePlanMatrixCellStatus(row, calendar)
    rows.push(row)

    if (planCount > 0) {
      if (isCurrentMonth && !onPace) {
        volumeLag.push(row)
      } else if (isPastMonth && countProgressPct < 95) {
        volumeLag.push(row)
      }
    }
    if (planAvg > 0 && factAvg != null && factAvg < planAvg * 0.95) {
      avgLag.push(row)
    }
  }

  volumeLag.sort((a, b) => (Number(a.count_progress_pct) || 0) - (Number(b.count_progress_pct) || 0))
  avgLag.sort((a, b) => (Number(a.avg_gap_rub) || 0) - (Number(b.avg_gap_rub) || 0))

  let summaryRu = ''
  if (volumeLag.length) {
    const worst = volumeLag[0]
    summaryRu = `Отставание по объёму: ${worst.label} — план ${worst.plan.count} чел., факт ${worst.fact.count}.`
  } else if (avgLag.length) {
    const worst = avgLag[0]
    summaryRu = `Средний чек ниже плана: ${worst.label} — план ${worst.plan.avg_check} ₽, факт ${worst.fact.avg_check} ₽.`
  } else if (rows.length) {
    summaryRu = 'По ячейкам плана — без критичного отставания по объёму и чеку.'
  }

  const statusOk = rows.filter((r) => r.status?.status === 'ok').length
  const statusLag = rows.filter((r) => r.status?.status === 'lag').length

  return {
    has_plan_matrix: true,
    rows,
    volume_lag: volumeLag,
    avg_lag: avgLag,
    summary_ru: summaryRu,
    status_summary: { ok: statusOk, lag: statusLag, total: rows.length },
    calendar_elapsed_pct: elapsedPct,
  }
}
