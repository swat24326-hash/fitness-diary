/**
 * node scripts/verify-membership-used-reconcile.mjs
 */
import {
  applyMembershipUsedReconcilePlan,
  planMembershipUsedReconcile,
} from '../src/lib/membership/membershipUsedReconcileCore.js'
import { completedTrainingsOnMembership } from '../src/lib/membershipRules.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const mem = { id: 'm1', start_date: '2026-01-01', end_date: '2026-12-31', used_trainings: 0 }
const trainings = [
  { id: 't1', status: 'completed', date: '2026-02-01', data: { membership_id: 'm1' } },
  { id: 't2', status: 'completed', date: '2026-02-05', data: { membership_id: 'm1' } },
  { id: 't3', status: 'draft', date: '2026-02-06', data: { membership_id: 'm1' } },
]

const plan = planMembershipUsedReconcile([mem], trainings)
ok(plan.length === 1 && plan[0].nextUsed === 2, 'used 0 → 2 по completed дневника')
ok(completedTrainingsOnMembership(mem, trainings).length === 2, 'parity с membershipRules')

const memOk = { ...mem, used_trainings: 2 }
ok(planMembershipUsedReconcile([memOk], trainings).length === 0, 'нет патча если уже совпало')

const memLegacy = { id: 'm2', start_date: '2026-03-01', end_date: '2026-03-31', used_trainings: 0 }
const legacyTrainings = [
  { id: 't4', status: 'completed', date: '2026-03-10', data: {} },
]
ok(
  planMembershipUsedReconcile([memLegacy], legacyTrainings)[0]?.nextUsed === 1,
  'legacy по диапазону дат',
)

const stale = { id: 'm3', start_date: '2026-01-01', end_date: '2026-12-28', used_trainings: 9, total_trainings: 38 }
const twelve = Array.from({ length: 12 }, (_, i) => ({
  id: `t-laz-${i}`,
  status: 'completed',
  date: `2026-02-${String(i + 1).padStart(2, '0')}`,
  data: { membership_id: 'm3' },
}))
const applied = applyMembershipUsedReconcilePlan([stale], twelve)
ok(applied.patches.length === 1 && applied.patches[0].used_trainings === 12, 'apply: патч 9 → 12')
ok(Number(applied.memberships[0]?.used_trainings) === 12, 'apply: в памяти used=12')
ok(applied.patches[0]?.id === 'm3', 'apply: id абона')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-membership-used-reconcile: all passed')
