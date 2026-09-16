/**
 * node scripts/verify-training-new-draft-date.mjs
 * /new: тренер не наследует вчерашнюю дату из durable (INC-2026-09-16-01).
 */
import { resolveTrainerNewTrainingOpenDate } from '../src/lib/trainer/trainingNewDraftDateCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-09-16'

ok(
  resolveTrainerNewTrainingOpenDate({
    isAdmin: false,
    todayIso: today,
    durableDateIso: '2026-09-15',
  }) === today,
  'тренер /new: вчера из durable → сегодня',
)

ok(
  resolveTrainerNewTrainingOpenDate({
    isAdmin: false,
    todayIso: today,
  }) === today,
  'тренер /new без durable → сегодня',
)

ok(
  resolveTrainerNewTrainingOpenDate({
    isAdmin: true,
    todayIso: today,
    durableDateIso: '2026-09-15',
  }) === '2026-09-15',
  'админ /new: durable дату сохраняет',
)

ok(
  resolveTrainerNewTrainingOpenDate({
    isAdmin: false,
    todayIso: today,
    scheduleDayIso: '2026-09-16',
    durableDateIso: '2026-09-15',
  }) === '2026-09-16',
  'слот ежедневника важнее durable',
)

ok(
  resolveTrainerNewTrainingOpenDate({
    isAdmin: false,
    todayIso: today,
    scheduleDayIso: '2026-09-20',
  }) === today,
  'будущий слот у тренера → clamp на сегодня',
)

ok(
  resolveTrainerNewTrainingOpenDate({
    isAdmin: true,
    todayIso: today,
    scheduleDayIso: '2026-09-20',
  }) === '2026-09-20',
  'админ: будущий слот без clamp',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
