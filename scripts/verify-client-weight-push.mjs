/**
 * Push веса: FK training_id не блокирует sync.
 * node scripts/verify-client-weight-push.mjs
 */

import assert from 'node:assert/strict'
import {
  isWeightEntryTrainingFkError,
  planWeightEntryPushPayload,
  sanitizeWeightEntryTrainingLink,
  pendingTrainingInsertIdsFromQueue,
} from '../src/lib/clientWeightPushCore.js'

assert.ok(
  isWeightEntryTrainingFkError(
    'insert or update on table "client_weight_entries" violates foreign key constraint "client_weight_entries_training_id_fkey"',
  ),
  'FK detector',
)

const stripped = sanitizeWeightEntryTrainingLink(
  { id: 'w1', client_id: 'c1', training_id: 't-missing', weight_kg: 80 },
  { trainingExists: false },
)
assert.equal(stripped.training_id, null, 'strip missing training_id')

const pending = pendingTrainingInsertIdsFromQueue([
  { table_name: 'trainings', operation: 'insert', data: { id: 't-new' } },
])
assert.ok(pending.has('t-new'), 'pending training insert')

const deferPlan = planWeightEntryPushPayload(
  { id: 'w1', training_id: 't-new', client_id: 'c1' },
  { queue: [{ table_name: 'trainings', operation: 'insert', data: { id: 't-new' } }] },
)
assert.equal(deferPlan.defer, true, 'defer until training insert')

const deletePlan = planWeightEntryPushPayload(
  { id: 'w1', training_id: 't-gone', client_id: 'c1' },
  {
    queue: [{ table_name: 'trainings', operation: 'delete', remote_id: 't-gone' }],
    trainingExistsLocally: true,
  },
)
assert.equal(deletePlan.payload.training_id, null, 'strip when training delete pending')

console.log('verify-client-weight-push: OK')
