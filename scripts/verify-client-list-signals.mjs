/**
 * node scripts/verify-client-list-signals.mjs
 */
import {
  membershipSignal,
  membershipSignalDotClass,
  MEMBERSHIP_EXPIRING_WITHIN_DAYS,
} from '../src/lib/clientListSignals.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-07-28'

const active = membershipSignal(
  [{ start_date: '2026-01-01', end_date: '2026-08-31', total_trainings: 10, used_trainings: 2 }],
  today,
)
ok(active.key === 'active' && active.factLabel == null, 'active usable')

const expiring = membershipSignal(
  [{ start_date: '2026-01-01', end_date: '2026-07-30', total_trainings: 10, used_trainings: 2 }],
  today,
)
ok(expiring.key === 'expiring', `expiring ≤${MEMBERSHIP_EXPIRING_WITHIN_DAYS}d (2d left)`)

const expiringDay5 = membershipSignal(
  [{ start_date: '2026-01-01', end_date: '2026-08-02', total_trainings: 10, used_trainings: 2 }],
  today,
)
ok(expiringDay5.key === 'expiring', 'expiring at exactly 5d left')

const stillActiveDay6 = membershipSignal(
  [{ start_date: '2026-01-01', end_date: '2026-08-03', total_trainings: 10, used_trainings: 2 }],
  today,
)
ok(stillActiveDay6.key === 'active', 'active when 6d left')
ok(MEMBERSHIP_EXPIRING_WITHIN_DAYS === 5, 'expiring window constant is 5')

const awaiting = membershipSignal(
  [
    { start_date: '2026-01-01', end_date: '2026-07-20', total_trainings: 8, used_trainings: 8 },
    { start_date: '2026-08-01', end_date: '2026-09-30', total_trainings: 12, used_trainings: 0 },
  ],
  today,
)
ok(awaiting.key === 'not_started', 'awaiting start key')
ok(awaiting.factLabel === 'начнётся 01.08.2026', 'awaiting fact has start date')
ok(awaiting.color === '#e8ece9', 'awaiting neutral color')
ok(membershipSignalDotClass(awaiting.key) === 'not_started', 'awaiting CSS class')

const onlyFuture = membershipSignal(
  [{ start_date: '2026-08-05', end_date: '2026-09-05', total_trainings: 8, used_trainings: 0 }],
  today,
)
ok(onlyFuture.key === 'not_started', 'only future membership → not_started')

const none = membershipSignal([], today)
ok(none.key === 'no_membership' && none.factLabel === 'нет абонемента', 'never had membership')
ok(membershipSignalDotClass(none.key) === 'none', 'no_membership uses red square class')

const expired = membershipSignal(
  [{ start_date: '2026-01-01', end_date: '2026-07-16', total_trainings: 10, used_trainings: 10 }],
  today,
)
ok(expired.key === 'expired', 'expired key')
ok(String(expired.factLabel).includes('закончился'), 'expired fact label')
ok(membershipSignalDotClass(expired.key) === 'none', 'expired red square')

const depleted = membershipSignal(
  [{ start_date: '2026-07-01', end_date: '2026-08-31', total_trainings: 8, used_trainings: 8 }],
  today,
)
ok(depleted.key === 'depleted' && depleted.factLabel === 'лимит исчерпан', 'depleted in window')

const expiredLeft = membershipSignal(
  [{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 10, used_trainings: 7 }],
  today,
)
ok(expiredLeft.key === 'expired_remaining', 'expired with remaining')
ok(membershipSignalDotClass(expiredLeft.key) === 'expired_recent', 'triangle class alias')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
