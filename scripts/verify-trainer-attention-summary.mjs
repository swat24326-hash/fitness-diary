/**
 * node scripts/verify-trainer-attention-summary.mjs
 */
import {
  ATTENTION_BIRTHDAY_WEEK_DAYS,
  STALE_TRAINING_DAYS,
  buildLastCompletedTrainingDateByClientId,
  buildTrainerAttentionSummary,
  daysSinceIsoDate,
  isClientStaleForAttention,
  isTrainerClientQuickFilter,
} from '../src/lib/trainer/trainerAttentionSummary.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(daysSinceIsoDate('2026-07-01', '2026-07-11') === 10, 'daysSinceIsoDate')
ok(daysSinceIsoDate('', '2026-07-11') == null, 'daysSinceIsoDate empty')

const lastMap = buildLastCompletedTrainingDateByClientId([
  { client_id: 'c1', status: 'draft', date: '2026-07-10' },
  { client_id: 'c1', status: 'completed', date: '2026-07-05' },
  { client_id: 'c1', status: 'completed', date: '2026-07-09' },
  { client_id: 'c2', status: 'completed', date: '2026-06-01' },
])
ok(lastMap.c1 === '2026-07-09', 'last completed ignores draft')
ok(lastMap.c2 === '2026-06-01', 'last completed c2')

const activeMem = [{ start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 10, used_trainings: 2 }]
ok(
  isClientStaleForAttention({
    memList: activeMem,
    lastCompletedIso: '2026-06-20',
    today: '2026-07-11',
    staleDays: 14,
  }),
  'stale when last training 21 days ago',
)
ok(
  !isClientStaleForAttention({
    memList: activeMem,
    lastCompletedIso: '2026-07-08',
    today: '2026-07-11',
    staleDays: 14,
  }),
  'not stale when recent training',
)
ok(
  isClientStaleForAttention({
    memList: activeMem,
    lastCompletedIso: '',
    today: '2026-07-11',
    staleDays: 14,
  }),
  'stale when never trained',
)
ok(
  !isClientStaleForAttention({
    memList: [],
    lastCompletedIso: '',
    today: '2026-07-11',
  }),
  'not stale without usable membership',
)

const today = '2026-07-10'
const summary = buildTrainerAttentionSummary({
  today,
  staleDays: STALE_TRAINING_DAYS,
  birthdayWeekDays: ATTENTION_BIRTHDAY_WEEK_DAYS,
  clients: [
    { id: 'a', birth_date: '1990-07-12' },
    { id: 'b', birth_date: '1990-08-01' },
    { id: 'c' },
    { id: 'd' },
  ],
  memByClient: {
    a: [{ start_date: '2026-01-01', end_date: '2026-07-12', total_trainings: 10, used_trainings: 1 }],
    b: [{ start_date: '2026-01-01', end_date: '2026-06-01', total_trainings: 10, used_trainings: 3 }],
    c: activeMem,
    d: activeMem,
  },
  lastCompletedByClientId: {
    a: '2026-07-09',
    b: '2026-05-01',
    c: '2026-06-01',
    d: '2026-07-08',
  },
})

ok(summary.birthdaysWeek === 1, 'birthday within week')
ok(summary.expiring === 1, 'expiring membership')
ok(summary.expired_remaining === 1, 'expired remaining')
ok(summary.stale === 2, 'stale b and c with old training')
ok(summary.actionable === 5, 'actionable total')
ok(isTrainerClientQuickFilter('stale'), 'stale is valid filter')
ok(!isTrainerClientQuickFilter('nope'), 'invalid filter')

if (failed) process.exit(1)
console.log('verify-trainer-attention-summary: all passed')
