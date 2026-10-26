import {
  clearClubSalesDrafts,
  fingerprintExpenseDraft,
  fingerprintPlanDraft,
  resolveDailyDraftAfterLoad,
  resolveExpenseDraftAfterLoad,
  salesDailyDraftKey,
  salesFinanceDraftKey,
  salesPlanDraftKey,
  shouldRestoreSalesDraft,
  uniqueSalesDraftHints,
} from '../src/lib/admin/adminSalesDraftStorage.js'
import { emptyExpenseForm } from '../src/lib/admin/supervisorExpenseCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(salesDailyDraftKey('club-1', '2026-07-07').includes('club-1:daily:2026-07-07'), 'daily draft key')

const serverFp = fingerprintPlanDraft({ plan_level_1: '100', plan_level_2: '', plan_level_3: '', plan_pz: '', plan_tz: '', plan_az: '', plan_extra: '' })
const editedFp = fingerprintPlanDraft({ plan_level_1: '200', plan_level_2: '', plan_level_3: '', plan_pz: '', plan_tz: '', plan_az: '', plan_extra: '' })

ok(
  shouldRestoreSalesDraft({ v: 1, serverBaselineFp: serverFp, fingerprint: editedFp }, serverFp),
  'restore draft when server baseline unchanged',
)
ok(
  !shouldRestoreSalesDraft({ v: 1, serverBaselineFp: serverFp, fingerprint: editedFp }, editedFp),
  'skip restore when server already matches draft fingerprint',
)
ok(
  !shouldRestoreSalesDraft({ v: 1, serverBaselineFp: serverFp, fingerprint: editedFp }, 'other-server'),
  'skip restore when server data changed elsewhere',
)

const dailyResolved = resolveDailyDraftAfterLoad({
  draft: {
    v: 1,
    serverBaselineFp: 'base',
    fingerprint: 'edited',
    dailyForm: { pnk_total: '5' },
    trainingsMatrix: { t1: '2' },
    aerobicMatrix: { a1: '1' },
  },
  serverFp: 'base',
  dailyForm: { pnk_total: '' },
  trainingsMatrix: {},
  aerobicMatrix: {},
})
ok(dailyResolved.restored && dailyResolved.dailyForm.pnk_total === '5', 'daily draft fields restored')

ok(salesPlanDraftKey('c', 2026, 7).endsWith(':plan:2026-07'), 'plan draft key month padded')
ok(salesFinanceDraftKey('c', 2026, 12).endsWith(':finance:2026-12'), 'finance draft key')

ok(
  uniqueSalesDraftHints(['план', 'план', 'расход', '', 'план']).join(',') === 'план,расход',
  'unique draft hints drop duplicates',
)

clearClubSalesDrafts({ clubId: 'c', year: 2026, month: 8, reportDate: '2026-08-14' })
ok(true, 'clearClubSalesDrafts runs without throw')

const serverExpense = {
  ...emptyExpenseForm(),
  expense_rent: '500000',
  expense_month: '500000',
}
const emptyExpense = emptyExpenseForm()
const serverExpenseFp = fingerprintExpenseDraft(serverExpense)
const emptyExpenseFp = fingerprintExpenseDraft(emptyExpense)
const expenseBlocked = resolveExpenseDraftAfterLoad({
  draft: {
    v: 1,
    serverBaselineFp: serverExpenseFp,
    fingerprint: emptyExpenseFp,
    expenseForm: emptyExpense,
  },
  serverFp: serverExpenseFp,
  expenseForm: serverExpense,
})
ok(!expenseBlocked.restored && expenseBlocked.discardStaleEmpty, 'refuse empty expense draft over server')
ok(expenseBlocked.expenseForm.expense_month === '500000', 'keeps server expense total')

const expensePartsOnly = resolveExpenseDraftAfterLoad({
  draft: {
    v: 1,
    serverBaselineFp: serverExpenseFp,
    fingerprint: 'edited-parts',
    expenseForm: { ...emptyExpenseForm(), expense_rent: '400000', expense_month: '' },
  },
  serverFp: serverExpenseFp,
  expenseForm: serverExpense,
})
ok(expensePartsOnly.restored, 'restore non-empty expense draft')
ok(expensePartsOnly.expenseForm.expense_month === '400000', 'sync month from draft parts')

process.exit(failed > 0 ? 1 : 0)
