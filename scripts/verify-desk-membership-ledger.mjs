/**
 * node scripts/verify-desk-membership-ledger.mjs
 */
import {
  deskMembershipLedgerKind,
  deskMembershipLedgerKindLabel,
  parseDeskPaidAmountInput,
  pickDeskActiveMembership,
  sortDeskMembershipLedger,
} from '../src/lib/admin/deskMembershipLedgerCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-08-01'
const list = [
  { id: 'old', start_date: '2025-01-01', end_date: '2025-12-31', total_trainings: 0 },
  { id: 'cur', start_date: '2026-07-01', end_date: '2026-09-30', total_trainings: 0 },
  { id: 'fut', start_date: '2026-10-01', end_date: '2026-12-31', total_trainings: 0 },
]

const active = pickDeskActiveMembership(list, today)
ok(active?.id === 'cur', 'active by calendar even with 0 trainings')
ok(deskMembershipLedgerKind(list[0], today, active.id) === 'expired', 'expired')
ok(deskMembershipLedgerKind(list[2], today, active.id) === 'future', 'future')
ok(deskMembershipLedgerKindLabel('active') === 'действующий', 'label ru')

const sorted = sortDeskMembershipLedger(list)
ok(sorted[0].id === 'fut', 'sort end desc')

ok(parseDeskPaidAmountInput('1 200') === 1200, 'parse paid')
ok(parseDeskPaidAmountInput('') == null, 'empty paid')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll desk membership ledger checks passed')
