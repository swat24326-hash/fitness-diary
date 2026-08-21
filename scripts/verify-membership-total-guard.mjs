/**
 * node scripts/verify-membership-total-guard.mjs
 */
import {
  isMembershipTotalBroken,
  membershipBrokenTotalHintRu,
  normalizeMembershipTotalTrainings,
  resolveEffectiveMembershipUsed,
  shouldConfirmSuspiciousLowTotal,
  suspiciousLowTotalConfirmMessageRu,
  validateMembershipTotalAgainstUsed,
} from '../src/lib/membership/membershipTotalGuardCore.js'
import { membershipUsageLabel } from '../src/lib/membershipRules.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

ok(resolveEffectiveMembershipUsed(5, 1) === 5, 'effective max stored')
ok(resolveEffectiveMembershipUsed(1, 5) === 5, 'effective max diary')
ok(resolveEffectiveMembershipUsed(0, 0) === 0, 'effective zero')
ok(normalizeMembershipTotalTrainings('1.9') === 1, 'normalize trunc')
ok(normalizeMembershipTotalTrainings(-2) === 0, 'normalize neg→0')

ok(!isMembershipTotalBroken({ totalTrainings: 0, usedEffective: 5 }), 'total 0 not broken (TZ)')
ok(!isMembershipTotalBroken({ totalTrainings: 8, usedEffective: 5 }), 'ok 5/8')
ok(isMembershipTotalBroken({ totalTrainings: 1, usedEffective: 5 }), 'broken 5/1')
ok(!isMembershipTotalBroken({ totalTrainings: 5, usedEffective: 5 }), 'exact not broken')

ok(validateMembershipTotalAgainstUsed({ totalTrainings: 0, usedStored: 3 }).ok, 'save total 0 ok')
ok(validateMembershipTotalAgainstUsed({ totalTrainings: 8, usedStored: 5, usedDiary: 5 }).ok, 'save 8>=5')
ok(
  !validateMembershipTotalAgainstUsed({ totalTrainings: 1, usedStored: 5, usedDiary: 5 }).ok,
  'save 1<5 blocked',
)
ok(
  validateMembershipTotalAgainstUsed({ totalTrainings: 1, usedStored: 5, usedDiary: 5 }).error.includes('5'),
  'save error mentions used',
)
ok(
  validateMembershipTotalAgainstUsed({ totalTrainings: 5, usedStored: 5, usedDiary: 4 }).ok,
  'save total===used ok',
)

ok(!shouldConfirmSuspiciousLowTotal({ totalTrainings: 1, isPnkTrialType: true }), 'BZ total=1 no confirm')
ok(shouldConfirmSuspiciousLowTotal({ totalTrainings: 1, isPnkTrialType: false }), 'paid total=1 confirm')
ok(shouldConfirmSuspiciousLowTotal({ totalTrainings: 3, isPnkTrialType: false }), 'paid total=3 confirm')
ok(!shouldConfirmSuspiciousLowTotal({ totalTrainings: 4, isPnkTrialType: false }), 'paid 4 no confirm')
ok(!shouldConfirmSuspiciousLowTotal({ totalTrainings: 8, isPnkTrialType: false }), 'paid 8 no confirm')
ok(suspiciousLowTotalConfirmMessageRu({ typeCode: 'Vip 2', totalTrainings: 2 }).includes('Vip 2'), 'confirm type')
ok(suspiciousLowTotalConfirmMessageRu({ totalTrainings: 2 }).includes('2'), 'confirm count')

ok(membershipBrokenTotalHintRu().length > 5, 'hint ru')

const mem = { id: 'm', start_date: '2026-07-01', end_date: '2026-08-31', total_trainings: 1, used_trainings: 5 }
const trainings = [
  { id: 't1', status: 'completed', date: '2026-07-10', data: { membership_id: 'm' } },
  { id: 't2', status: 'completed', date: '2026-07-15', data: { membership_id: 'm' } },
]
const label = membershipUsageLabel(mem, trainings)
ok(label.includes('5/1'), 'usage label 5/1')
ok(label.includes('лимит'), 'usage label marks broken')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll membership-total-guard checks passed')
