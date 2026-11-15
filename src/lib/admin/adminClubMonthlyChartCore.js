/**
 * Чистая логика графика «Итог» по месяцам.
 */

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
  return Number.isInteger(raw) ? raw : Math.round(raw)
}

export function yTicks(chartMax, steps = 5) {
  const out = []
  const max = Number(chartMax) || 0
  for (let i = steps; i >= 0; i--) {
    out.push(Math.round((max * i) / steps))
  }
  return out
}

/** Среднее по месяцам с ненулевым count (1 знак), null если пусто. */
export function averageMonthlyCount(rows) {
  const list = Array.isArray(rows) ? rows : []
  let sum = 0
  let n = 0
  for (const r of list) {
    const c = Number(r?.count ?? 0) || 0
    if (c <= 0) continue
    sum += c
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
 * @param {Array<{ month?: string, count?: number }>|null|undefined} rows
 * @param {{ todayIso?: string }} [opts]
 */
export function buildAdminClubMonthlyChartModel(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : []
  const currentMonth = currentMonthKeyFromTodayIso(opts.todayIso)
  let max = 0
  let sum = 0
  let peak = null
  let peakN = 0
  for (const r of list) {
    const n = Number(r?.count ?? 0) || 0
    sum += n
    if (n > max) max = n
    if (n > peakN) {
      peakN = n
      peak = String(r?.month ?? '')
    }
  }
  const avgCount = averageMonthlyCount(list)
  const cm = chartMaxValue(Math.max(max, avgCount != null ? avgCount : 0))
  return {
    chartMax: cm,
    ticks: yTicks(cm),
    total: sum,
    hasAny: sum > 0,
    peakMonth: peakN > 0 ? peak : null,
    avgCount,
    currentMonth,
    avgBottomPct: cm > 0 && avgCount != null ? Math.min(100, (avgCount / cm) * 100) : null,
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
