/**
 * Расход управляющего: статьи + итог (amount).
 * Без React / IndexedDB.
 */

/** @typedef {'expense_rent' | 'expense_expenses' | 'expense_deposits' | 'expense_accounting'} ExpensePartFormKey */

/** Ключи формы (строки ввода). */
export const SUPERVISOR_EXPENSE_PART_KEYS = /** @type {const} */ ([
  'expense_rent',
  'expense_expenses',
  'expense_deposits',
  'expense_accounting',
])

/** Колонки БД ↔ ключ формы. */
export const SUPERVISOR_EXPENSE_PART_DB = /** @type {const} */ ({
  expense_rent: 'amount_rent',
  expense_expenses: 'amount_expenses',
  expense_deposits: 'amount_deposits',
  expense_accounting: 'amount_accounting',
})

export const SUPERVISOR_EXPENSE_PART_LABELS = /** @type {const} */ ({
  expense_rent: 'Аренда',
  expense_expenses: 'Расходы',
  expense_deposits: 'Оклады',
  expense_accounting: 'Бухгалтерия',
})

/** Колонки для select/upsert. */
export const SUPERVISOR_EXPENSE_SELECT_COLS =
  'amount, amount_rent, amount_expenses, amount_deposits, amount_accounting, updated_at'

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
  return {
    expense_rent: '',
    expense_expenses: '',
    expense_deposits: '',
    expense_accounting: '',
    expense_month: '',
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
export function expenseRowToForm(row) {
  if (!row) return emptyExpenseForm()

  const rent = Number(row.amount_rent) || 0
  const expenses = Number(row.amount_expenses) || 0
  const deposits = Number(row.amount_deposits) || 0
  const accounting = Number(row.amount_accounting) || 0
  const partsSum = Math.round((rent + expenses + deposits + accounting) * 100) / 100
  const total = Number(row.amount) || 0

  /** Legacy: одна сумма без статей → всё в «Расходы». */
  const legacyOnly = partsSum <= 0 && total > 0

  const form = {
    expense_rent: rent > 0 ? String(rent) : '',
    expense_expenses: legacyOnly ? String(total) : expenses > 0 ? String(expenses) : '',
    expense_deposits: deposits > 0 ? String(deposits) : '',
    expense_accounting: accounting > 0 ? String(accounting) : '',
    expense_month: '',
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
  const amount =
    Math.round(
      (parts.amount_rent + parts.amount_expenses + parts.amount_deposits + parts.amount_accounting) * 100,
    ) / 100
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
