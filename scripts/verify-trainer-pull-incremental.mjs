/**
 * node scripts/verify-trainer-pull-incremental.mjs
 */
import {
  normalizeTrainingsSinceDate,
  resolveTrainerPullTrainingsSince,
  shouldForceFullTrainerPull,
} from '../src/lib/trainerPullIncremental.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeTrainingsSinceDate('2026-06-01') === '2026-06-01', 'valid trainings_since')
ok(normalizeTrainingsSinceDate('bad') === null, 'invalid trainings_since')
ok(normalizeTrainingsSinceDate('') === null, 'empty trainings_since')

const last = Date.parse('2026-06-10T12:00:00.000Z')
const since = resolveTrainerPullTrainingsSince({ lastPullAt: last })
ok(since === '2026-06-09', 'overlap one day before last pull')

ok(resolveTrainerPullTrainingsSince({ fullPull: true }) === null, 'full pull clears since')
ok(resolveTrainerPullTrainingsSince({ lastPullAt: null }) === null, 'no last pull → full window')

ok(shouldForceFullTrainerPull({ trainings_truncated: true }) === true, 'truncated forces full')
ok(shouldForceFullTrainerPull({ trainings_truncated: false }) === false, 'not truncated')

if (failed) process.exit(1)
console.log('verify-trainer-pull-incremental: all passed')
