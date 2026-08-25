/**
 * node scripts/verify-training-draft-delete.mjs
 */
import {
  collectPendingTrainingDeleteIds,
  isTrainingPendingDelete,
  shouldRestoreTrainingDraftCandidate,
  shouldSkipDurableHydrateForTraining,
} from '../src/lib/trainingDraftCleanupCore.js'
import { pickTrainingDraftRestore } from '../src/lib/trainingDraftRestoreCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const queue = [
  { table_name: 'trainings', operation: 'delete', remote_id: 'draft-1' },
  { table_name: 'trainings', operation: 'update', remote_id: 'draft-2' },
  { table_name: 'clients', operation: 'delete', remote_id: 'c1' },
]

const pendingDeletes = collectPendingTrainingDeleteIds(queue)
ok(pendingDeletes.size === 1, 'collect only training deletes')
ok(pendingDeletes.has('draft-1'), 'delete id captured')
ok(!pendingDeletes.has('draft-2'), 'update not treated as delete')

ok(shouldSkipDurableHydrateForTraining(pendingDeletes, 'draft-1'), 'skip hydrate when delete pending')
ok(!shouldSkipDurableHydrateForTraining(pendingDeletes, 'draft-2'), 'allow hydrate when only update pending')
ok(!shouldSkipDurableHydrateForTraining(pendingDeletes, 'draft-3'), 'allow hydrate for unrelated id')
ok(shouldSkipDurableHydrateForTraining(pendingDeletes, ''), 'skip empty training id')
ok(isTrainingPendingDelete(pendingDeletes, 'draft-1'), 'isTrainingPendingDelete true')
ok(!isTrainingPendingDelete(pendingDeletes, 'draft-2'), 'isTrainingPendingDelete false for update')

ok(shouldRestoreTrainingDraftCandidate('', 't1'), 'restore allowed without block')
ok(!shouldRestoreTrainingDraftCandidate('t1', 't1'), 'restore blocked for deleted id')
ok(shouldRestoreTrainingDraftCandidate('t1', 't2'), 'restore allowed for other id')

const blockedPick = pickTrainingDraftRestore({
  blockedTrainingId: 't1',
  idbRow: { id: 't1', status: 'draft', data: { cooldown: 'idb' } },
  durable: {
    trainingId: 't1',
    status: 'draft',
    revisedAt: '2026-08-26T12:00:00.000Z',
    workoutState: { cooldown: 'durable' },
  },
  session: {
    trainingId: 't1',
    workoutState: { cooldown: 'session' },
    revisionMs: Date.parse('2026-08-26T13:00:00.000Z'),
  },
})
ok(blockedPick.source === 'empty', 'pick returns empty when training blocked')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-training-draft-delete: all checks passed')
