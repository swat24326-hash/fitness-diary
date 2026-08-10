/**
 * Заморозка ЗП: снимок месяца vs live.
 * node scripts/verify-trainer-pay-month-snapshot.mjs
 */
import {
  buildPayMonthSnapshotPayload,
  normalizePayMonthSnapshotPayload,
  payrollOptsFromSnapshot,
  shouldFreezePayMonth,
  slimMembershipTypeForPaySnapshot,
} from '../src/lib/admin/trainerPayMonthSnapshotCore.js'
import { aggregatePayrollFromDailyRows } from '../src/lib/admin/trainerPayrollCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(shouldFreezePayMonth(2026, 7, new Date('2026-08-09T12:00:00')) === true, 'July frozen in August')
ok(shouldFreezePayMonth(2026, 8, new Date('2026-08-09T12:00:00')) === false, 'August live in August')
ok(shouldFreezePayMonth(2026, 9, new Date('2026-08-09T12:00:00')) === false, 'future not freeze flag')

const vipLive = {
  id: 'vip',
  code: 'VIP',
  trainer_pay_l1: 200,
  trainer_pay_l2: 350,
  trainer_pay_l3: 500,
  trainer_pay_per_session: 200,
}
const snapPayload = buildPayMonthSnapshotPayload({
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profiles: [{ trainer_id: 'tr1', club_id: 'c1', on_plan: true, rate_adjustment_rub: 0 }],
  membershipTypes: [vipLive],
})
ok(snapPayload.membershipTypes[0].trainer_pay_l3 === 500, 'snapshot keeps L3')
ok(slimMembershipTypeForPaySnapshot(vipLive).trainer_pay_l1 === 200, 'slim L1')
ok(slimMembershipTypeForPaySnapshot(vipLive).counts_toward_pay_plan === true, 'slim plan flag from rates fallback')
ok(
  slimMembershipTypeForPaySnapshot({ ...vipLive, counts_toward_pay_plan: false }).counts_toward_pay_plan === false,
  'slim keeps explicit false',
)

const matrix = [{ trainer_id: 'tr1', membership_type_id: 'vip', count: 100 }]
const daily = [{ trainings_matrix: matrix }]

const optsSnap = payrollOptsFromSnapshot(snapPayload, { clubId: 'c1' })
const payFrozen = aggregatePayrollFromDailyRows(daily, null, optsSnap)
ok(payFrozen.clubTotal === 350 * 100, 'frozen L2 rate for 100 workouts')

// Live rates changed — snapshot payroll must stay
const liveChanged = [
  {
    ...vipLive,
    trainer_pay_l1: 999,
    trainer_pay_l2: 999,
    trainer_pay_l3: 999,
  },
]
const payLiveWould = aggregatePayrollFromDailyRows(daily, null, {
  membershipTypes: liveChanged,
  planConfig: snapPayload.planConfig,
  profilesByTrainerId: optsSnap.profilesByTrainerId,
  clubId: 'c1',
})
ok(payLiveWould.clubTotal === 999 * 100, 'live changed rates')
ok(payFrozen.clubTotal !== payLiveWould.clubTotal, 'frozen ignores later rate change')

// Edit matrix count — recalc with frozen rates
const edited = [{ trainings_matrix: [{ trainer_id: 'tr1', membership_type_id: 'vip', count: 50 }] }]
const payEdited = aggregatePayrollFromDailyRows(edited, null, optsSnap)
ok(payEdited.clubTotal === 200 * 50, 'edit matrix uses frozen L1 for 50 workouts')

const roundTrip = normalizePayMonthSnapshotPayload({
  plan_config: { hours_l2_min: 80, hours_l3_min: 120 },
  membership_types: [vipLive],
  profiles: [{ trainer_id: 'tr1', on_plan: false, rate_adjustment_rub: 10 }],
})
ok(roundTrip.planConfig.workouts_l2_min === 80, 'normalize legacy hours keys')
ok(roundTrip.profiles[0].on_plan === false, 'normalize profile on_plan')

if (failed > 0) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer pay month snapshot checks passed')
