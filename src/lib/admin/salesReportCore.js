/** Чистая логика отчётов продаж (без React / IDB). */

export const SALES_MATRIX_KEYS = [
  'pz_nk',
  'pz_dk',
  'pz_uk',
  'tz_nk',
  'tz_dk',
  'tz_uk',
  'az_nk',
  'az_dk',
  'az_uk',
]

/** @param {string} iso YYYY-MM-DD */
export function monthPartsFromIso(iso) {
  const s = String(iso ?? '').slice(0, 10)
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  return { year: y, month: m }
}

/** @param {number} year @param {number} month 1–12 */
export function monthDateRange(year, month) {
  const y = Number(year)
  const m = Number(month)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export function parseSalesMoney(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!s) return 0
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return NaN
  return Math.round(n * 100) / 100
}

export function parseSalesCount(raw) {
  const s = String(raw ?? '').trim().replace(/\s/g, '')
  if (!s) return 0
  const n = Math.floor(Number(s.replace(',', '.')))
  if (!Number.isFinite(n) || n < 0) return NaN
  return n
}

export function computeProfitDay(profitNk, profitDk, profitUk) {
  const nk = Number(profitNk) || 0
  const dk = Number(profitDk) || 0
  const uk = Number(profitUk) || 0
  return Math.round((nk + dk + uk) * 100) / 100
}

export function computeNetProfit(earnings, expense) {
  const e = Number(earnings) || 0
  const x = Number(expense) || 0
  return Math.round((e - x) * 100) / 100
}

export function planProgressPercent(fact, planTotal) {
  const f = Number(fact) || 0
  const p = Number(planTotal) || 0
  if (p <= 0) return 0
  return Math.round((f / p) * 1000) / 10
}

export function formatRub(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  const rounded = Math.round(n)
  return `${new Intl.NumberFormat('ru-RU').format(rounded)} ₽`
}

export function emptyDailyForm() {
  return {
    profit_nk: '',
    profit_dk: '',
    profit_uk: '',
    pnk_total: '',
    trainings_count: '',
    pz_nk: '',
    pz_dk: '',
    pz_uk: '',
    tz_nk: '',
    tz_dk: '',
    tz_uk: '',
    az_nk: '',
    az_dk: '',
    az_uk: '',
  }
}

/** @param {Record<string, unknown> | null | undefined} row */
export function dailyRowToForm(row) {
  if (!row) return emptyDailyForm()
  const f = emptyDailyForm()
  for (const k of ['profit_nk', 'profit_dk', 'profit_uk']) {
    const v = row[k]
    f[k] = v == null || v === '' ? '' : String(v)
  }
  for (const k of ['pnk_total', 'trainings_count', ...SALES_MATRIX_KEYS]) {
    const v = row[k]
    f[k] = v == null || v === '' ? '' : String(Math.trunc(Number(v) || 0))
  }
  return f
}

/**
 * @param {Record<string, string>} form
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
export function dailyFormToPayload(form) {
  const profit_nk = parseSalesMoney(form.profit_nk)
  const profit_dk = parseSalesMoney(form.profit_dk)
  const profit_uk = parseSalesMoney(form.profit_uk)
  if ([profit_nk, profit_dk, profit_uk].some((n) => Number.isNaN(n))) {
    return { ok: false, error: 'Прибыль: укажите неотрицательные суммы' }
  }
  const pnk_total = parseSalesCount(form.pnk_total)
  const trainings_count = parseSalesCount(form.trainings_count)
  if (Number.isNaN(pnk_total) || Number.isNaN(trainings_count)) {
    return { ok: false, error: 'ПНК и тренировки: целые числа ≥ 0' }
  }
  const payload = {
    profit_nk,
    profit_dk,
    profit_uk,
    pnk_total,
    trainings_count,
  }
  for (const key of SALES_MATRIX_KEYS) {
    const n = parseSalesCount(form[key])
    if (Number.isNaN(n)) return { ok: false, error: 'Матрица: целые числа ≥ 0' }
    payload[key] = n
  }
  return { ok: true, payload }
}

/** @param {Array<Record<string, unknown>>} rows */
export function aggregateMonthFromDailyRows(rows) {
  let profitNk = 0
  let profitDk = 0
  let profitUk = 0
  let profitTotal = 0
  let trainingsTotal = 0
  let dayCount = 0
  for (const r of rows ?? []) {
    const nk = Number(r.profit_nk) || 0
    const dk = Number(r.profit_dk) || 0
    const uk = Number(r.profit_uk) || 0
    profitNk += nk
    profitDk += dk
    profitUk += uk
    profitTotal += computeProfitDay(nk, dk, uk)
    trainingsTotal += Number(r.trainings_count) || 0
    dayCount += 1
  }
  return {
    profitNk: Math.round(profitNk * 100) / 100,
    profitDk: Math.round(profitDk * 100) / 100,
    profitUk: Math.round(profitUk * 100) / 100,
    profitTotal: Math.round(profitTotal * 100) / 100,
    trainingsTotal,
    dayCount,
  }
}

/** @param {Record<string, string>} form */
export function planFormToPayload(form) {
  const plan_total = parseSalesMoney(form.plan_total)
  const plan_pz = parseSalesMoney(form.plan_pz)
  const plan_tz = parseSalesMoney(form.plan_tz)
  const plan_az = parseSalesMoney(form.plan_az)
  if ([plan_total, plan_pz, plan_tz, plan_az].some((n) => Number.isNaN(n))) {
    return { ok: false, error: 'План: неотрицательные суммы' }
  }
  return { ok: true, payload: { plan_total, plan_pz, plan_tz, plan_az } }
}

/** @param {Record<string, string>} form */
export function expenseFormToPayload(form) {
  const amount = parseSalesMoney(form.expense_month)
  if (Number.isNaN(amount)) return { ok: false, error: 'Расход: неотрицательная сумма' }
  return { ok: true, payload: { amount } }
}

export function emptyPlanForm() {
  return { plan_total: '', plan_pz: '', plan_tz: '', plan_az: '' }
}

export function planRowToForm(row) {
  const f = emptyPlanForm()
  if (!row) return f
  for (const k of Object.keys(f)) {
    const v = row[k]
    f[k] = v == null || v === '' ? '' : String(v)
  }
  return f
}

export function emptyExpenseForm() {
  return { expense_month: '' }
}

export function expenseRowToForm(row) {
  if (!row || row.amount == null) return emptyExpenseForm()
  return { expense_month: String(row.amount) }
}
