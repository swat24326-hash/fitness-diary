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

// Клинцы: El 0/4 + БЗ 1/1 (старт позже) — открытие видит El, списание не должно брать БЗ.
const elPaid = {
  id: 'el-paid',
  start_date: '2026-07-24',
  end_date: '2026-08-31',
  total_trainings: 4,
  used_trainings: 0,
}
const bzDepleted = {
  id: 'bz-1',
  start_date: '2026-08-22',
  end_date: '2026-09-05',
  total_trainings: 1,
  used_trainings: 1,
}
const overlap = planMembershipFirstCompletionDebit([elPaid, bzDepleted], '2026-08-24')
ok(overlap.ok === true, 'CRITICAL: El с остатком + БЗ 1/1 — debit ok')
ok(overlap.membershipId === 'el-paid', 'CRITICAL: списываем El, не исчерпанный БЗ')

const onlyBz = planMembershipFirstCompletionDebit([bzDepleted], '2026-08-24')
ok(onlyBz.ok === false && onlyBz.code === MEMBERSHIP_DEBIT_BLOCK.LIMIT, 'только БЗ 1/1 — LIMIT')

const outside = planMembershipFirstCompletionDebit([elPaid], '2026-09-10')
ok(outside.code === MEMBERSHIP_DEBIT_BLOCK.NO_ACTIVE, 'вне срока — NO_ACTIVE')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-membership-debit: all passed')
