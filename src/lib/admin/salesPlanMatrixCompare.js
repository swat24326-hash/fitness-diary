/** Сравнение плана по ячейкам матрицы с фактом из дневных отчётов. */

import {
  planProgressPercent,
  SALES_MATRIX_COLS,
  SALES_MATRIX_HALL_ROWS,
  sumMatrix3x3AmountsFromDailyRows,
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

    const row = {
      cellKey,
      hall,
      col,
      label: planMatrixCellLabel(hall, col),
      plan: { count: planCount, avg_check: planAvg, amount: planAmount },
      fact: { count: factCount, avg_check: factAvg, amount: factAmount },
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
