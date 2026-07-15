/**
 * node scripts/verify-trainer-attention-summary.mjs
 */
import {
  STALE_TRAINING_DAYS,
  buildLastCompletedTrainingDateByClientId,
  buildTrainerAttentionSummary,
  daysSinceIsoDate,
  isClientStaleForAttention,
  isTrainerClientQuickFilter,
  normalizeTrainerClientQuickFilter,
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
  !isClientStaleForAttention({
    memList: activeMem,
    today: '2026-07-11',
    staleDays: 14,
  }),
  'active membership never stale (even without trainings)',
)

ok(
  isClientStaleForAttention({
    memList: [{ start_date: '2026-01-01', end_date: '2026-06-20', total_trainings: 10, used_trainings: 10 }],
    today: '2026-07-11',
    staleDays: 14,
  }),
  'stale when abo ended 21 days ago',
)

ok(
  !isClientStaleForAttention({
    memList: [{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 10, used_trainings: 10 }],
    today: '2026-07-11',
    staleDays: 14,
  }),
  'not stale when abo ended yesterday (expired_recent)',
)

ok(
  !isClientStaleForAttention({
    memList: [{ start_date: '2026-01-01', end_date: '2026-07-05', total_trainings: 10, used_trainings: 10 }],
    today: '2026-07-11',
    staleDays: 14,
  }),
  'not stale when abo ended 6 days ago',
)

const today = '2026-07-15'
const summary = buildTrainerAttentionSummary({
  today,
  staleDays: STALE_TRAINING_DAYS,
  clients: [
    { id: 'a', birth_date: '1990-07-15' },
    { id: 'b', birth_date: '1990-08-01' },
    { id: 'c' },
    { id: 'd' },
    { id: 'e' },
  ],
  memByClient: {
    a: [{ start_date: '2026-01-01', end_date: '2026-07-17', total_trainings: 10, used_trainings: 1 }],
    b: [{ start_date: '2026-01-01', end_date: '2026-07-14', total_trainings: 10, used_trainings: 10 }],
    c: activeMem,
    d: [{ start_date: '2026-01-01', end_date: '2026-06-20', total_trainings: 10, used_trainings: 10 }],
    e: [{ start_date: '2026-01-01', end_date: '2026-07-10', total_trainings: 8, used_trainings: 8 }],
  },
})

ok(summary.birthdays === 1, 'birthday today only')
ok(summary.expiring === 1, 'expiring membership')
ok(summary.expired_recent === 1, 'expired recent yesterday (b)')
ok(summary.stale === 1, 'stale only d (abo ended 25 days ago)')
ok(summary.actionable === 4, 'actionable without overlap: bday+expiring+expired_recent+stale')
ok(isTrainerClientQuickFilter('stale'), 'stale is valid filter')
ok(normalizeTrainerClientQuickFilter('expired_remaining') === 'expired_recent', 'legacy filter alias')
ok(!isTrainerClientQuickFilter('nope'), 'invalid filter')

if (failed) process.exit(1)
console.log('verify-trainer-attention-summary: all passed')
