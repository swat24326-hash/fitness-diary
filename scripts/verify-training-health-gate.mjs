/**
 * node scripts/verify-training-health-gate.mjs
 */
import { getHealthCardCompletionIssues } from '../src/lib/healthCardCore.js'
import { getTrainingCompletionIssues } from '../src/lib/trainingCompletionValidation.js'
import {
  resolveHealthForTrainingGate,
  shouldRefreshTrainingHealthOnStorageEvent,
} from '../src/lib/trainingHealthGateCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const completeHealth = {
  height_cm: 180,
  initial_weight_kg: 80,
  sex: 'male',
  health_filled_at: '2026-08-01',
}

const staleHealth = { weight_kg: 79 }

const minimalWorkout = {
  pre_weight_kg: 80,
  training_focus: 'Сила',
  mood: 3,
  desire: 3,
  sleep_hours: 7,
  hours_after_meal: 2,
  warmup: 'бег',
  warmup_duration_min: 10,
  cooldown: 'раст',
  cooldown_duration_min: 5,
  stars: 4,
  exercises: [{ catalog_exercise_id: 'e1', sets: [{ reps: 10 }] }],
}

ok(
  resolveHealthForTrainingGate(completeHealth, staleHealth)?.height_cm === 180,
  'fresh IDB health wins over stale screen snapshot',
)
ok(
  resolveHealthForTrainingGate(null, staleHealth)?.weight_kg === 79,
  'cached health used only when IDB row missing',
)
ok(resolveHealthForTrainingGate(undefined, null) == null, 'no health when both missing')

const gateIssues = getTrainingCompletionIssues(
  minimalWorkout,
  { health: resolveHealthForTrainingGate(completeHealth, staleHealth), isFirstCompletion: true },
)
ok(!gateIssues.some((m) => m.includes('карте здоровья')), 'first completion passes with fresh health')

const blocked = getTrainingCompletionIssues(
  minimalWorkout,
  { health: resolveHealthForTrainingGate(null, staleHealth), isFirstCompletion: true },
)
ok(blocked.some((m) => m.includes('карте здоровья')), 'stale/incomplete cached health still blocks when IDB empty')

ok(getHealthCardCompletionIssues(completeHealth).length === 0, 'complete card has no issues')

ok(
  shouldRefreshTrainingHealthOnStorageEvent({ reason: 'health-card-saved', client_id: 'c1' }, 'c1'),
  'refresh on health save for same client',
)
ok(
  !shouldRefreshTrainingHealthOnStorageEvent({ reason: 'health-card-saved', client_id: 'c2' }, 'c1'),
  'ignore health save for other client',
)
ok(shouldRefreshTrainingHealthOnStorageEvent({ reason: 'sync-queue' }, 'c1'), 'refresh after sync queue')
ok(
  !shouldRefreshTrainingHealthOnStorageEvent({ reason: 'challenge-deleted' }, 'c1'),
  'ignore unrelated storage reasons',
)

const sessionStaleNoHeight = { weight_kg: 70 }

ok(
  !getTrainingCompletionIssues(minimalWorkout, {
    health: resolveHealthForTrainingGate(completeHealth, sessionStaleNoHeight),
    isFirstCompletion: true,
  }).some((m) => m.includes('карте здоровья')),
  'INCIDENT: session snapshot without height + IDB complete → gate passes',
)

ok(
  getTrainingCompletionIssues(minimalWorkout, {
    health: sessionStaleNoHeight,
    isFirstCompletion: true,
  }).some((m) => m.includes('карте здоровья')),
  'INCIDENT: only stale snapshot without height still blocks (old bug path)',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-health-gate: all passed')
