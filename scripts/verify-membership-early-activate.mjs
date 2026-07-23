/**
 * node scripts/verify-membership-early-activate.mjs
 */
import {
  canOfferEarlyMembershipActivation,
  membershipPeriodDayCount,
  pickEarliestUpcomingMembership,
  proposeEarlyMembershipActivation,
  pickUsableMembershipForDate,
} from '../src/lib/membershipRules.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-07-13'
const upcoming = {
  id: 'm2',
  start_date: '2026-07-14',
  end_date: '2026-08-14',
  total_trainings: 8,
  used_trainings: 0,
}
const oldEnded = {
  id: 'm1',
  start_date: '2026-06-01',
  end_date: '2026-07-12',
  total_trainings: 8,
  used_trainings: 8,
}
const stillUsable = {
  id: 'm0',
  start_date: '2026-06-01',
  end_date: '2026-07-20',
  total_trainings: 8,
  used_trainings: 6,
}

ok(membershipPeriodDayCount({ start_date: '2026-07-14', end_date: '2026-07-14' }) === 1, 'period 1 day')
ok(membershipPeriodDayCount(upcoming) === 32, 'period Jul14–Aug14 = 32 days')

ok(pickEarliestUpcomingMembership([oldEnded, upcoming], today)?.id === 'm2', 'pick earliest upcoming')
ok(!pickUsableMembershipForDate([oldEnded, upcoming], today), 'no usable on gap day')
ok(canOfferEarlyMembershipActivation([oldEnded, upcoming], today), 'offer on gap')
ok(!canOfferEarlyMembershipActivation([stillUsable, upcoming], today), 'no offer while old usable')

const prop = proposeEarlyMembershipActivation(upcoming, today)
ok(prop.ok === true, 'propose ok')
ok(prop.to.start === '2026-07-13' && prop.to.end === '2026-08-13', 'shift preserves length')
ok(prop.daysShift === 1, 'shift 1 day')
ok(prop.warnFar === false, '1 day not far')

const far = proposeEarlyMembershipActivation(
  { ...upcoming, start_date: '2026-08-01', end_date: '2026-09-01' },
  today,
)
ok(far.ok && far.daysShift === 19 && far.warnFar === true, 'far shift >14 warns')

const at14 = proposeEarlyMembershipActivation(
  { ...upcoming, start_date: '2026-07-27', end_date: '2026-08-27' },
  today,
)
ok(at14.ok && at14.daysShift === 14 && at14.warnFar === false, 'exactly 14 days — no warn')

const over14 = proposeEarlyMembershipActivation(
  { ...upcoming, start_date: '2026-07-28', end_date: '2026-08-28' },
  today,
)
ok(over14.ok && over14.daysShift === 15 && over14.warnFar === true, '15 days — warn')

ok(proposeEarlyMembershipActivation(upcoming, '2026-07-14').ok === false, 'activate on start → already_started')
ok(proposeEarlyMembershipActivation(stillUsable, today).ok === false, 'usable not upcoming')

if (failed) process.exit(1)
console.log('\nverify-membership-early-activate: all passed')
