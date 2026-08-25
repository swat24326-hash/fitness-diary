/**
 * node scripts/verify-training-draft-restore.mjs
 */
import {
  compareTrainingDraftCandidates,
  pickTrainingDraftRestore,
  workoutDraftContentScore,
} from '../src/lib/trainingDraftRestoreCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(workoutDraftContentScore({ cooldown: 'су' }) < workoutDraftContentScore({ cooldown: 'суставная' }), 'cooldown richness')
ok(
  workoutDraftContentScore({
    exercises: [{ name: 'Жим', sets: [{ reps: '10', weight: '50' }] }],
  }) >
    workoutDraftContentScore({ cooldown: 'суставная' }),
  'exercises outweigh cooldown only',
)

const rich = {
  workoutState: {
    cooldown: 'суставная',
    exercises: [{ name: 'Жим', sets: [{ reps: '10' }] }],
  },
  revisionMs: Date.parse('2026-08-26T10:00:00.000Z'),
}
const partial = {
  workoutState: { cooldown: 'су' },
  revisionMs: Date.parse('2026-08-26T10:00:30.000Z'),
}
ok(compareTrainingDraftCandidates(rich, partial) > 0, 'CRITICAL: richer draft wins over newer partial autosave')

const picked = pickTrainingDraftRestore({
  idbRow: {
    id: 't1',
    client_id: 'c1',
    status: 'draft',
    updated_at: '2026-08-26T10:00:30.000Z',
    data: { cooldown: 'су' },
  },
  durable: {
    clientId: 'c1',
    trainingId: 't1',
    status: 'draft',
    revisedAt: '2026-08-26T10:00:00.000Z',
    workoutState: {
      cooldown: 'суставная',
      exercises: [{ name: 'Тяга', sets: [{ reps: '12' }] }],
    },
  },
})
ok(picked.source === 'durable', 'pick prefers durable full body over idb partial')
ok(String(picked.workoutState.cooldown) === 'суставная', 'pick cooldown text')
ok(Array.isArray(picked.workoutState.exercises) && picked.workoutState.exercises.length === 1, 'pick exercises kept')

const sessionWin = pickTrainingDraftRestore({
  idbRow: {
    id: 't1',
    client_id: 'c1',
    status: 'draft',
    updated_at: '2026-08-26T09:00:00.000Z',
    data: {},
  },
  session: {
    workoutState: { cooldown: 'суставная' },
    revisionMs: Date.parse('2026-08-26T10:01:00.000Z'),
  },
})
ok(sessionWin.source === 'session', 'session cache can restore after home navigation')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-draft-restore: all passed')
