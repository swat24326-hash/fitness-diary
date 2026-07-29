import {
  canFetchMembershipTypesViaApi,
  pickMembershipTypesForSalesReport,
} from '../src/lib/admin/salesMembershipTypesAccessCore.js'
import { filterAerobicSalesTypes } from '../src/lib/membershipTypesCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(canFetchMembershipTypesViaApi({ isAdmin: true }), 'admin can fetch types')
ok(canFetchMembershipTypesViaApi({ isTrainer: true }), 'trainer can fetch types')
ok(canFetchMembershipTypesViaApi({ isSalesManager: true }), 'sales manager can fetch types')
ok(!canFetchMembershipTypesViaApi({}), 'anonymous cannot fetch types')

const stale = [
  { id: '1', code: 'Бокс', trainer_assignable: false },
  { id: '2', code: 'R1+', trainer_assignable: false },
  { id: '3', code: 'R2+', trainer_assignable: false },
]
const fresh = [
  ...stale,
  { id: '4', code: 'R3+', trainer_assignable: false },
]

ok(
  pickMembershipTypesForSalesReport(stale, fresh).some((t) => t.code === 'R3+'),
  'prefer longer ensured list with R3+',
)
ok(
  pickMembershipTypesForSalesReport(fresh, stale).some((t) => t.code === 'R3+'),
  'prefer longer bundle list with R3+',
)

const aerobic = filterAerobicSalesTypes(fresh)
ok(aerobic.some((t) => t.code === 'R3+'), 'R3+ is aerobic column when trainer_assignable=false')
ok(
  !filterAerobicSalesTypes([{ id: '4', code: 'R3+', trainer_assignable: true }]).length,
  'R3+ as PZ does not appear in aerobic matrix',
)

process.exit(failed > 0 ? 1 : 0)
