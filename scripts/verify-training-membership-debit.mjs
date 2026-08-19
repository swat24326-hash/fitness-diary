/**
 * node scripts/verify-training-membership-debit.mjs
 */
import {
  MEMBERSHIP_DEBIT_BLOCK,
  planMembershipFirstCompletionDebit,
} from '../src/lib/trainer/trainingMembershipDebitCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const active = {
  id: 'm1',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  total_trainings: 10,
  used_trainings: 2,
}

ok(planMembershipFirstCompletionDebit([active], '2026-03-01').ok === true, 'активный абон — debit ok')
ok(
  planMembershipFirstCompletionDebit([active], '2026-03-01').membershipId === 'm1',
  'membership_id для dataPayload',
)

const depleted = { ...active, used_trainings: 10 }
ok(
  planMembershipFirstCompletionDebit([depleted], '2026-03-01').code === MEMBERSHIP_DEBIT_BLOCK.LIMIT,
  'лимит исчерпан',
)

ok(
  planMembershipFirstCompletionDebit([], '2026-03-01').code === MEMBERSHIP_DEBIT_BLOCK.NO_ACTIVE,
  'нет абона на дату',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-membership-debit: all passed')
