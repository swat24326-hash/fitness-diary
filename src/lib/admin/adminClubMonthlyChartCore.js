/**
 * Чистая логика графика «Итог» по месяцам.
 */

/**
 * Нормализация строки: count (объём) или value (серии).
 * @param {{ month?: string, count?: number, value?: number | null }|null|undefined} row
 * @returns {{ month: string, value: number | null }}
 */
export function normalizeMonthlyChartRow(row) {
  const month = String(row?.month ?? '')
  if (row && Object.prototype.hasOwnProperty.call(row, 'value')) {
    const v = row.value
    if (v == null || !Number.isFinite(Number(v))) return { month, value: null }
    return { month, value: Number(v) }
  }
  const c = Number(row?.count ?? 0) || 0
  return { month, value: c }
}

/** Верх шкалы Y с «красивым» шагом (плотнее к реальному пику). */
export function chartMaxValue(maxCount) {
  const n = Number(maxCount) || 0
  if (n <= 0) return 5
  const exp = Math.pow(10, Math.floor(Math.log10(n)))
  const f = n / exp
  let nice = 10
  if (f <= 1) nice = 1
  else if (f <= 1.25) nice = 1.25
  else if (f <= 1.5) nice = 1.5
  else if (f <= 2) nice = 2
  else if (f <= 2.5) nice = 2.5
  else if (f <= 5) nice = 5
  const raw = nice * exp
  return Number.isInteger(raw) ? raw : Math.round(raw * 1000) / 1000
}

export function yTicks(chartMax, steps = 5) {
  const out = []
  const max = Number(chartMax) || 0
  for (let i = steps; i >= 0; i--) {
    const raw = (max * i) / steps
    out.push(Number.isInteger(max) && Number.isInteger(raw) ? raw : Math.round(raw * 10) / 10)
  }
  return out
}

/**
 * Среднее по месяцам с числовым value (null/нечисло пропускаем).
 * Для объёма нули не входят (как раньше); для прочих — нули входят.
 * @param {Array<{ month?: string, count?: number, value?: number | null }>|null|undefined} rows
 * @param {{ includeZero?: boolean }} [opts]
 */
export function averageMonthlyCount(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : []
  const includeZero = opts.includeZero === true
  let sum = 0
  let n = 0
  for (const r of list) {
    const { value } = normalizeMonthlyChartRow(r)
    if (value == null || !Number.isFinite(value)) continue
    if (!includeZero && value <= 0) continue
    sum += value
    n += 1
  }
  if (!n) return null
  return Math.round((sum / n) * 10) / 10
}

/** YYYY-MM текущего месяца клуба из todayIso (YYYY-MM-DD). */
export function currentMonthKeyFromTodayIso(todayIso) {
  const s = String(todayIso ?? '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(s)
  if (!m) return ''
  return `${m[1]}-${m[2]}`
}

/**
 * @param {Array<{ month?: string, count?: number, value?: number | null }>|null|undefined} rows
 * @param {{ todayIso?: string, includeZeroInAvg?: boolean, forceMax?: number | null }} [opts]
 */
export function buildAdminClubMonthlyChartModel(rows, opts = {}) {
  const list = (Array.isArray(rows) ? rows : []).map(normalizeMonthlyChartRow)
  const currentMonth = currentMonthKeyFromTodayIso(opts.todayIso)
  const includeZeroInAvg = opts.includeZeroInAvg === true
  let max = 0
  let sum = 0
  let peak = null
  let peakN = -Infinity
  let hasNumeric = false
  for (const r of list) {
    const n = r.value
    if (n == null || !Number.isFinite(n)) continue
    hasNumeric = true
    sum += n
    if (n > max) max = n
    if (n > peakN) {
      peakN = n
      peak = String(r.month ?? '')
    }
  }
  const avgCount = averageMonthlyCount(list, { includeZero: includeZeroInAvg })
  const forced = Number(opts.forceMax)
  const cm =
    Number.isFinite(forced) && forced > 0
      ? forced
      : chartMaxValue(Math.max(max, avgCount != null ? avgCount : 0))
  return {
    chartMax: cm,
    ticks: yTicks(cm),
    total: sum,
    hasAny: hasNumeric && list.some((r) => r.value != null && Number(r.value) > 0),
    peakMonth: peakN > -Infinity && peakN > 0 ? peak : null,
    avgCount,
    currentMonth,
    avgBottomPct: cm > 0 && avgCount != null ? Math.min(100, (avgCount / cm) * 100) : null,
    rows: list,
  }
}

export function monthLabelRu(ym) {
  const s = String(ym ?? '')
  const [y, m] = s.split('-')
  const yy = Number(y)
  const mm = Number(m)
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return s
  const d = new Date(yy, mm - 1, 1)
  return new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric' }).format(d)
}

/** Полное имя месяца для оси (январь); чужой год — «январь ’26». */
export function monthLabelAxis(ym, chartYear) {
  const s = String(ym ?? '')
  const [y, m] = s.split('-')
  const yy = Number(y)
  const mm = Number(m)
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return s
  const d = new Date(yy, mm - 1, 1)
  const mon = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(d)
  if (chartYear && yy === chartYear) return mon
  const yr = String(yy).slice(-2)
  return `${mon} ’${yr}`
}

/** Короткое имя на оси графика (окт.); полное — в title. */
export function monthLabelAxisShort(ym, chartYear) {
  const s = String(ym ?? '')
  const [y, m] = s.split('-')
  const yy = Number(y)
  const mm = Number(m)
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return s
  const d = new Date(yy, mm - 1, 1)
  const mon = new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(d).replace(/\.$/, '')
  if (chartYear && yy === chartYear) return mon
  const yr = String(yy).slice(-2)
  return `${mon} ’${yr}`
}
