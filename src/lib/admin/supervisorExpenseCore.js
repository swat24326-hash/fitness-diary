/**
 * Расход управляющего: статьи + итог (amount).
 * Без React / IndexedDB.
 */

/** @typedef {'expense_rent' | 'expense_expenses' | 'expense_deposits' | 'expense_accounting' | 'expense_sales'} ExpensePartFormKey */

/** Ключи формы (строки ввода). */
export const SUPERVISOR_EXPENSE_PART_KEYS = /** @type {const} */ ([
  'expense_rent',
  'expense_expenses',
  'expense_deposits',
  'expense_accounting',
  'expense_sales',
])

/** Колонки БД ↔ ключ формы. */
export const SUPERVISOR_EXPENSE_PART_DB = /** @type {const} */ ({
  expense_rent: 'amount_rent',
  expense_expenses: 'amount_expenses',
  expense_deposits: 'amount_deposits',
  expense_accounting: 'amount_accounting',
  expense_sales: 'amount_sales',
})

export const SUPERVISOR_EXPENSE_PART_LABELS = /** @type {const} */ ({
  expense_rent: 'Аренда',
  expense_expenses: 'Расходы',
  expense_deposits: 'Оклады',
  expense_accounting: 'Бухгалтерия',
  expense_sales: 'Отдел продаж',
})

/** Колонки для select/upsert. */
export const SUPERVISOR_EXPENSE_SELECT_COLS =
  'amount, amount_rent, amount_expenses, amount_deposits, amount_accounting, amount_sales, updated_at'

/**
 * Как parseSalesMoney: пусто → 0; отрицательное / мусор → NaN.
 * @param {unknown} raw
 */
export function parseExpensePartMoney(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!s) return 0
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return Number.NaN
  return n
}

/**
 * @param {Record<string, string> | null | undefined} form
 * @returns {number}
 */
export function sumExpenseParts(form) {
  let sum = 0
  for (const key of SUPERVISOR_EXPENSE_PART_KEYS) {
    const n = parseExpensePartMoney(form?.[key])
    if (Number.isNaN(n)) return Number.NaN
    sum += n
  }
  return Math.round(sum * 100) / 100
}

export function emptyExpenseForm() {
  /** @type {Record<string, string>} */
  const form = { expense_month: '' }
  for (const key of SUPERVISOR_EXPENSE_PART_KEYS) form[key] = ''
  return form
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
export function expenseRowToForm(row) {
  if (!row) return emptyExpenseForm()

  /** @type {Record<string, number>} */
  const partAmounts = {}
  let partsSum = 0
  for (const key of SUPERVISOR_EXPENSE_PART_KEYS) {
    const dbCol = SUPERVISOR_EXPENSE_PART_DB[key]
    const n = Number(row[dbCol]) || 0
    partAmounts[key] = n
    partsSum += n
  }
  partsSum = Math.round(partsSum * 100) / 100
  const total = Number(row.amount) || 0

  /** Legacy: одна сумма без статей → всё в «Расходы». */
  const legacyOnly = partsSum <= 0 && total > 0

  /** @type {Record<string, string>} */
  const form = { expense_month: '' }
  for (const key of SUPERVISOR_EXPENSE_PART_KEYS) {
    if (legacyOnly && key === 'expense_expenses') {
      form[key] = String(total)
    } else {
      const n = partAmounts[key]
      form[key] = n > 0 ? String(n) : ''
    }
  }
  const sum = sumExpenseParts(form)
  form.expense_month = Number.isFinite(sum) && sum > 0 ? String(sum) : total > 0 ? String(total) : ''
  return form
}

/**
 * @param {Record<string, string>} form
 * @returns {{ ok: true, payload: Record<string, number> } | { ok: false, error: string }}
 */
export function expenseFormToPayload(form) {
  /** @type {Record<string, number>} */
  const parts = {}
  for (const key of SUPERVISOR_EXPENSE_PART_KEYS) {
    const n = parseExpensePartMoney(form?.[key])
    if (Number.isNaN(n)) {
      return { ok: false, error: `${SUPERVISOR_EXPENSE_PART_LABELS[key]}: неотрицательная сумма` }
    }
    parts[SUPERVISOR_EXPENSE_PART_DB[key]] = n
  }
  const amount = Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 100) / 100
  return {
    ok: true,
    payload: {
      amount,
      ...parts,
    },
  }
}

/**
 * Обновить одну статью и пересчитать expense_month.
 * @param {Record<string, string>} form
 * @param {string} key
 * @param {string} value
 */
export function patchExpenseFormPart(form, key, value) {
  const next = { ...form, [key]: value }
  const sum = sumExpenseParts(next)
  if (Number.isFinite(sum) && !Number.isNaN(sum)) {
    next.expense_month = sum > 0 ? String(sum) : ''
  }
  return next
}
