/**
 * Push веса: FK training_id не блокирует sync; вес ждёт insert клиента.
 * node scripts/verify-client-weight-push.mjs
 */

import assert from 'node:assert/strict'
import {
  isWeightEntryTrainingFkError,
  planWeightEntryPushPayload,
  sanitizeWeightEntryTrainingLink,
  pendingTrainingInsertIdsFromQueue,
} from '../src/lib/clientWeightPushCore.js'
import {
  CLIENT_PENDING_IN_CLOUD_PUSH_ERROR,
  planEnsureClientQueuedForPush,
  queueHasClientInsert,
} from '../src/lib/syncClientPendingPushCore.js'

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

const clientQueue = [{ table_name: 'clients', operation: 'insert', data: { id: 'c1' } }]
assert.ok(queueHasClientInsert(clientQueue, 'c1'), 'client insert detected in queue')
const deferClient = planWeightEntryPushPayload(
  { id: 'w2', client_id: 'c1', training_id: null, weight_kg: 70 },
  { queue: clientQueue },
)
assert.equal(deferClient.defer, true, 'defer weight while client insert pending')
assert.ok(
  String(deferClient.reason ?? '').includes('облаке'),
  'defer reason is pending-client',
)

assert.deepEqual(
  planEnsureClientQueuedForPush({
    clientId: 'c1',
    localClient: { id: 'c1', name: 'Виктория' },
    queue: [],
  }),
  { action: 'enqueue_insert', clientId: 'c1' },
  'missing cloud → re-queue local client',
)
assert.equal(
  planEnsureClientQueuedForPush({
    clientId: 'c1',
    localClient: { id: 'c1' },
    queue: clientQueue,
  }).action,
  'none',
  'already queued → no duplicate',
)
assert.equal(
  planEnsureClientQueuedForPush({
    clientId: 'c1',
    localClient: null,
    queue: [],
  }).action,
  'drop_dependent',
  'no local client → drop orphan weight',
)
assert.ok(
  CLIENT_PENDING_IN_CLOUD_PUSH_ERROR.toLowerCase().includes('облаке'),
  'canonical pending-client message',
)

console.log('verify-client-weight-push: OK')
