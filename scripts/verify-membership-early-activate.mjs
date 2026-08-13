/**
 * node scripts/verify-membership-early-activate.mjs
 * Ранняя активация + поздний старт (сдвиг от первой тренировки).
 */
import {
  canOfferEarlyMembershipActivation,
  canOfferLateMembershipStart,
  canStartNewTrainingForMemberships,
  inspectLateMembershipStart,
  membershipPeriodDayCount,
  membershipPeriodsOverlap,
  pickEarliestUpcomingMembership,
  proposeEarlyMembershipActivation,
  proposeLateMembershipStart,
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
ok(canStartNewTrainingForMemberships([oldEnded, upcoming], today), 'list button allows start on gap')
ok(canStartNewTrainingForMemberships([stillUsable, upcoming], today), 'list button allows start when usable')
ok(!canStartNewTrainingForMemberships([oldEnded], today), 'list button blocked without upcoming')
ok(
  canStartNewTrainingForMemberships(
    [{ id: 'm', start_date: '2026-08-14', end_date: '2026-09-14', total_trainings: 8, used_trainings: 0 }],
    '2026-08-10',
  ),
  'Semenov-like: start 14, today 10 → can open new training',
)

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

// --- late start (первая тренировка после start_date) ---

const lateBase = {
  id: 'late1',
  start_date: '2026-08-11',
  end_date: '2026-09-10',
  total_trainings: 8,
  used_trainings: 0,
}
const firstVisit = '2026-08-12'
ok(membershipPeriodDayCount(lateBase) === 31, 'late base period 31 days')

const late1 = proposeLateMembershipStart(lateBase, firstVisit, { otherMemberships: [lateBase] })
ok(late1.ok === true, 'late +1 day ok')
ok(late1.to.start === '2026-08-12' && late1.to.end === '2026-09-11', 'late shift preserves length')
ok(late1.daysShift === 1, 'late shift 1 day')
ok(canOfferLateMembershipStart([lateBase], firstVisit), 'can offer late on +1')

const lateAligned = proposeLateMembershipStart(lateBase, '2026-08-11')
ok(lateAligned.ok === false && lateAligned.error === 'already_aligned', 'same day → already_aligned')

const lateUsed = proposeLateMembershipStart({ ...lateBase, used_trainings: 1 }, firstVisit)
ok(lateUsed.ok === false && lateUsed.error === 'already_used', 'used>0 → already_used')

const lateAt14 = proposeLateMembershipStart(lateBase, '2026-08-25')
ok(lateAt14.ok === true && lateAt14.daysShift === 14, 'exactly 14 days late ok')

const late15 = proposeLateMembershipStart(lateBase, '2026-08-26')
ok(late15.ok === false && late15.error === 'too_late', '15 days → too_late')
ok(!canOfferLateMembershipStart([lateBase], '2026-08-26'), 'no offer when too late')

const nextMem = {
  id: 'late2',
  start_date: '2026-09-10',
  end_date: '2026-10-10',
  total_trainings: 8,
  used_trainings: 0,
}
ok(membershipPeriodsOverlap({ start_date: '2026-08-12', end_date: '2026-09-11' }, nextMem), 'overlap helper')
const lateOverlap = proposeLateMembershipStart(lateBase, firstVisit, {
  otherMemberships: [lateBase, nextMem],
})
ok(lateOverlap.ok === false && lateOverlap.error === 'overlap', 'late shift blocked by next membership')

const diaryTrainings = [
  {
    id: 'tr1',
    status: 'completed',
    date: '2026-08-11',
    data: { membership_id: 'late1' },
  },
]
const lateDiary = proposeLateMembershipStart(lateBase, firstVisit, {
  otherMemberships: [lateBase],
  clientTrainings: diaryTrainings,
})
ok(lateDiary.ok === false && lateDiary.error === 'already_used', 'diary completed → already_used even if used_trainings=0')

const inspOffer = inspectLateMembershipStart([lateBase], firstVisit, [])
ok(inspOffer.status === 'offer', 'inspect offer')
const inspOverlap = inspectLateMembershipStart([lateBase, nextMem], firstVisit, [])
ok(inspOverlap.status === 'blocked' && inspOverlap.reason === 'overlap' && inspOverlap.message, 'inspect overlap blocked with message')
const inspTooLate = inspectLateMembershipStart([lateBase], '2026-08-26', [])
ok(inspTooLate.status === 'blocked' && inspTooLate.reason === 'too_late', 'inspect too_late blocked')
const inspDiary = inspectLateMembershipStart([lateBase], firstVisit, diaryTrainings)
ok(inspDiary.status === 'skip' && inspDiary.reason === 'already_used', 'inspect diary skip')

if (failed) process.exit(1)
console.log('\nverify-membership-early-activate: all passed')
