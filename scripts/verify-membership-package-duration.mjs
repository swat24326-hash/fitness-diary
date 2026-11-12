/**
 * node scripts/verify-membership-package-duration.mjs
 * Длительность пакета: месяцы с числа на число, 1.5 = +1 мес + 14д, дни, сдвиг активации.
 */
import {
  formatMembershipDurationLabel,
  membershipDurationFromPreset,
  membershipPackageEndIso,
  membershipShiftEndIso,
  normalizeMembershipDuration,
} from '../src/lib/membership/membershipPackageDurationCore.js'
import { proposeEarlyMembershipActivation } from '../src/lib/membershipRules.js'
import { normalizeMembershipPushPayload } from '../src/lib/membershipPushPayload.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(membershipPackageEndIso('2026-03-15', 'months', 1) === '2026-04-15', '15.03 + 1 мес → 15.04')
ok(membershipPackageEndIso('2026-03-15', 'months', 1.5) === '2026-04-29', '15.03 + 1.5 → 29.04')
ok(membershipPackageEndIso('2026-01-31', 'months', 1) === '2026-02-28', '31.01 + 1 → 28.02')
ok(membershipPackageEndIso('2026-03-15', 'days', 47) === '2026-04-30', '15.03 + 47 дн. включ.')
ok(membershipPackageEndIso('2026-03-15', 'days', 1) === '2026-03-15', '1 день = тот же день')

ok(normalizeMembershipDuration('months', 1.5)?.count === 1.5, 'normalize 1.5')
ok(normalizeMembershipDuration('months', 1.25) == null, 'reject 1.25 months')
ok(normalizeMembershipDuration('days', 47)?.count === 47, 'normalize 47 days')
ok(formatMembershipDurationLabel({ unit: 'months', count: 1.5 }) === '1.5 мес.', 'label 1.5')
ok(formatMembershipDurationLabel({ unit: 'days', count: 47 }) === '47 дн.', 'label 47')

const fromPreset = membershipDurationFromPreset('1.5')
ok(fromPreset?.unit === 'months' && fromPreset.count === 1.5, 'preset 1.5')
ok(membershipDurationFromPreset('__custom__', '47')?.count === 47, 'preset custom days')

const withSnap = {
  id: 'm1',
  start_date: '2026-04-15',
  end_date: '2026-05-29',
  duration_unit: 'months',
  duration_count: 1.5,
  total_trainings: 8,
  used_trainings: 0,
}
ok(membershipShiftEndIso(withSnap, '2026-03-15') === '2026-04-29', 'shift 1.5 from new start')

const daysSnap = {
  id: 'm2',
  start_date: '2026-04-01',
  end_date: '2026-05-17',
  duration_unit: 'days',
  duration_count: 47,
  total_trainings: 8,
  used_trainings: 0,
}
ok(membershipShiftEndIso(daysSnap, '2026-03-15') === '2026-04-30', 'shift 47 days')

const legacy = {
  id: 'm3',
  start_date: '2026-07-14',
  end_date: '2026-08-14',
  total_trainings: 8,
  used_trainings: 0,
}
ok(membershipShiftEndIso(legacy, '2026-07-13') === '2026-08-13', 'legacy day-shift')

const early15 = proposeEarlyMembershipActivation(withSnap, '2026-03-15')
ok(early15.ok && early15.to.start === '2026-03-15' && early15.to.end === '2026-04-29', 'early activate 1.5')
ok(early15.durationLabel === '1.5 мес.', 'early activate label')

const early47 = proposeEarlyMembershipActivation(daysSnap, '2026-03-15')
ok(early47.ok && early47.to.end === '2026-04-30', 'early activate 47 days')

const pushOk = normalizeMembershipPushPayload({
  id: 'm9',
  duration_unit: 'months',
  duration_count: 1.5,
  used_trainings: 0,
})
ok(pushOk.ok && pushOk.data.duration_count === 1.5, 'push keeps 1.5')

const pushDays = normalizeMembershipPushPayload({
  id: 'm10',
  duration_unit: 'days',
  duration_count: 47,
})
ok(pushDays.ok && pushDays.data.duration_count === 47, 'push keeps 47 days')

const pushBad = normalizeMembershipPushPayload({
  id: 'm11',
  duration_unit: 'months',
  duration_count: 1.25,
})
ok(!pushBad.ok, 'push rejects 1.25 months')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
