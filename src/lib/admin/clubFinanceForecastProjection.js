/** Проекция месяца: факт + средние будни/выходных на незаполненные дни (fallback — среднее × дней месяца). */

export const FORECAST_METHOD_UNIFORM = 'avg_per_report_day_times_days_in_month'
export const FORECAST_METHOD_WEEKDAY_WEEKEND = 'weekday_weekend_remaining'

/** Минимум будних отчётов, чтобы считать среднее будня надёжным. */
export const MIN_WEEKDAY_SAMPLES_FOR_SPLIT = 2
/** Минимум выходных отчётов, чтобы считать среднее выходного надёжным. */
export const MIN_WEEKEND_SAMPLES_FOR_SPLIT = 2

/** @param {number} year @param {number} month 1–12 */
function daysInCalendarMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate()
}

/**
 * @param {number} jsDay 0=вс … 6=сб
 * @returns {boolean}
 */
export function isWeekendJsDay(jsDay) {
  return jsDay === 0 || jsDay === 6
}

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {'weekday' | 'weekend' | null}
 */
export function weekdayKindFromIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').slice(0, 10))
  if (!m) return null
  const y = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(y, month - 1, day)
  if (dt.getFullYear() !== y || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null
  return isWeekendJsDay(dt.getDay()) ? 'weekend' : 'weekday'
}

/**
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} day 1–31
 */
export function isoDateInMonth(year, month, day) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`
}

/**
 * Дни месяца без отчёта — сколько будней и выходных осталось «дотянуть».
 * @param {number} year
 * @param {number} month
 * @param {Set<string>} reportedIsos
 */
export function countRemainingDayTypes(year, month, reportedIsos) {
  const daysInMonth = daysInCalendarMonth(year, month)
  let remainingWeekdays = 0
  let remainingWeekends = 0
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = isoDateInMonth(year, month, day)
    if (reportedIsos.has(iso)) continue
    const kind = weekdayKindFromIso(iso)
    if (kind === 'weekend') remainingWeekends += 1
    else remainingWeekdays += 1
  }
  return { remainingWeekdays, remainingWeekends, daysInMonth }
}

/**
 * @param {Array<Record<string, unknown>>} monthRows
 * @param {(row: Record<string, unknown>) => number} getValue
 */
function collectDatedMetricRows(monthRows, getValue) {
  /** @type {Array<{ iso: string, kind: 'weekday' | 'weekend', value: number }>} */
  const dated = []
  let fact = 0
  let missingDate = 0
  for (const row of monthRows ?? []) {
    const value = Number(getValue(row)) || 0
    fact += value
    const iso = String(row?.report_date ?? '').slice(0, 10)
    const kind = weekdayKindFromIso(iso)
    if (!kind) {
      missingDate += 1
      continue
    }
    dated.push({ iso, kind, value })
  }
  return { dated, fact, missingDate, reportDays: (monthRows ?? []).length }
}

/**
 * Прогноз итога месяца по одной метрике.
 * @param {{
 *   monthRows: Array<Record<string, unknown>>,
 *   year: number,
 *   month: number,
 *   getValue: (row: Record<string, unknown>) => number,
 *   roundFn?: (n: number) => number,
 * }} opts
 */
export function projectMonthMetric(opts) {
  const year = Number(opts.year)
  const month = Number(opts.month)
  const roundFn = opts.roundFn ?? ((n) => n)
  const { dated, fact, missingDate, reportDays } = collectDatedMetricRows(opts.monthRows, opts.getValue)
  const daysInMonth = daysInCalendarMonth(year, month)
  const scale = reportDays > 0 ? daysInMonth / reportDays : 1
  const uniformForecast = roundFn(fact * scale)

  /** @type {Record<string, unknown>} */
  const base = {
    fact: roundFn(fact),
    reportDays,
    daysInMonth,
    scale: Math.round(scale * 10000) / 10000,
    weekdaySamples: 0,
    weekendSamples: 0,
    weekdayAvg: null,
    weekendAvg: null,
    remainingWeekdays: 0,
    remainingWeekends: 0,
  }

  if (reportDays <= 0) {
    return {
      ...base,
      method: FORECAST_METHOD_UNIFORM,
      forecastTotal: roundFn(0),
    }
  }

  if (missingDate > 0 || dated.length !== reportDays) {
    return {
      ...base,
      method: FORECAST_METHOD_UNIFORM,
      forecastTotal: uniformForecast,
    }
  }

  const reportedIsos = new Set(dated.map((d) => d.iso))
  const remaining = countRemainingDayTypes(year, month, reportedIsos)
  const weekdays = dated.filter((d) => d.kind === 'weekday')
  const weekends = dated.filter((d) => d.kind === 'weekend')

  base.weekdaySamples = weekdays.length
  base.weekendSamples = weekends.length
  base.remainingWeekdays = remaining.remainingWeekdays
  base.remainingWeekends = remaining.remainingWeekends

  if (
    weekdays.length < MIN_WEEKDAY_SAMPLES_FOR_SPLIT ||
    weekends.length < MIN_WEEKEND_SAMPLES_FOR_SPLIT
  ) {
    return {
      ...base,
      method: FORECAST_METHOD_UNIFORM,
      forecastTotal: uniformForecast,
    }
  }

  const weekdayAvg = weekdays.reduce((s, d) => s + d.value, 0) / weekdays.length
  const weekendAvg = weekends.reduce((s, d) => s + d.value, 0) / weekends.length
  const forecastTotal = roundFn(
    fact + weekdayAvg * remaining.remainingWeekdays + weekendAvg * remaining.remainingWeekends,
  )
  const effectiveScale = fact > 0 ? forecastTotal / fact : scale

  return {
    ...base,
    method: FORECAST_METHOD_WEEKDAY_WEEKEND,
    forecastTotal,
    weekdayAvg: roundFn(weekdayAvg),
    weekendAvg: roundFn(weekendAvg),
    scale: Math.round(effectiveScale * 10000) / 10000,
  }
}

function roundRubPace(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * Сколько ₽ нужно в будний день, чтобы закрыть план (выходные в знаменатель не кладём).
 * @param {{
 *   planTarget: number,
 *   factGross: number,
 *   remainingWeekdays?: number,
 *   remainingWeekends?: number,
 *   daysInMonth?: number,
 *   reportDays?: number,
 * }} opts
 * @returns {{
 *   gapRub: number,
 *   perDayRub: number | null,
 *   remainingWeekdays: number,
 *   remainingDays: number,
 *   mode: 'already_at_plan' | 'weekday' | 'any_day' | 'no_days_left',
 * } | null}
 */
export function computePlanPaceNeeded(opts) {
  const planTarget = roundRubPace(opts.planTarget)
  const factGross = roundRubPace(opts.factGross)
  if (planTarget <= 0) return null

  const gapRub = roundRubPace(Math.max(0, planTarget - factGross))
  const remWd = Math.max(0, Number(opts.remainingWeekdays) || 0)
  const remWe = Math.max(0, Number(opts.remainingWeekends) || 0)
  const remTyped = remWd + remWe
  const remFallback = Math.max(0, (Number(opts.daysInMonth) || 0) - (Number(opts.reportDays) || 0))

  if (gapRub <= 0) {
    return {
      gapRub: 0,
      perDayRub: 0,
      remainingWeekdays: remWd,
      remainingDays: remTyped || remFallback,
      mode: 'already_at_plan',
    }
  }

  if (remWd > 0) {
    return {
      gapRub,
      perDayRub: roundRubPace(gapRub / remWd),
      remainingWeekdays: remWd,
      remainingDays: remWd + remWe,
      mode: 'weekday',
    }
  }

  const remainingDays = remTyped > 0 ? remTyped : remFallback
  if (remainingDays <= 0) {
    return {
      gapRub,
      perDayRub: null,
      remainingWeekdays: 0,
      remainingDays: 0,
      mode: 'no_days_left',
    }
  }

  return {
    gapRub,
    perDayRub: roundRubPace(gapRub / remainingDays),
    remainingWeekdays: 0,
    remainingDays,
    mode: 'any_day',
  }
}
