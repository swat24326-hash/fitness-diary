/**
 * Расход управляющего по статьям.
 * node scripts/verify-supervisor-expense-parts.mjs
 */
import {
  emptyExpenseForm,
  expenseFormToPayload,
  expenseRowToForm,
  patchExpenseFormPart,
  sumExpenseParts,
  SUPERVISOR_EXPENSE_PART_KEYS,
  SUPERVISOR_EXPENSE_PART_LABELS,
} from '../src/lib/admin/supervisorExpenseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(Object.keys(emptyExpenseForm()).includes('expense_rent'), 'empty has rent')
ok(Object.keys(emptyExpenseForm()).includes('expense_sales'), 'empty has sales dept')
ok(SUPERVISOR_EXPENSE_PART_KEYS.length === 5, 'five expense parts')
ok(sumExpenseParts(emptyExpenseForm()) === 0, 'empty sum 0')

const filled = patchExpenseFormPart(
  patchExpenseFormPart(emptyExpenseForm(), 'expense_rent', '100000'),
  'expense_expenses',
  '50000',
)
ok(filled.expense_month === '150000', 'patch updates total')
ok(sumExpenseParts(filled) === 150000, 'sum rent+expenses')

const payload = expenseFormToPayload({
  expense_rent: '100000',
  expense_expenses: '200000',
  expense_deposits: '10000',
  expense_accounting: '50000',
  expense_sales: '40000',
  expense_month: '',
})
ok(payload.ok === true, 'payload ok')
ok(payload.payload?.amount === 400000, 'payload amount is sum of five')
ok(payload.payload?.amount_rent === 100000, 'payload rent')
ok(payload.payload?.amount_sales === 40000, 'payload sales')
ok(payload.payload?.amount_accounting === 50000, 'payload accounting')

const bad = expenseFormToPayload({
  ...emptyExpenseForm(),
  expense_rent: '-1',
})
ok(bad.ok === false && String(bad.error).includes(SUPERVISOR_EXPENSE_PART_LABELS.expense_rent), 'reject negative')

const legacy = expenseRowToForm({ amount: 360000 })
ok(legacy.expense_expenses === '360000', 'legacy total → Расходы')
ok(legacy.expense_rent === '', 'legacy rent empty')
ok(legacy.expense_month === '360000', 'legacy month total')

const partsRow = expenseRowToForm({
  amount: 400000,
  amount_rent: 100000,
  amount_expenses: 200000,
  amount_deposits: 10000,
  amount_accounting: 50000,
  amount_sales: 40000,
})
ok(partsRow.expense_rent === '100000', 'row rent')
ok(partsRow.expense_deposits === '10000', 'row оклады (amount_deposits)')
ok(SUPERVISOR_EXPENSE_PART_LABELS.expense_deposits === 'Оклады', 'label Оклады')
ok(SUPERVISOR_EXPENSE_PART_LABELS.expense_sales === 'Отдел продаж', 'label Отдел продаж')
ok(partsRow.expense_sales === '40000', 'row sales')
ok(partsRow.expense_month === '400000', 'row total')

if (failed) process.exit(1)
console.log('verify-supervisor-expense-parts: all passed')
