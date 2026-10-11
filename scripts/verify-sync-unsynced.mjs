/**
 * node scripts/verify-sync-unsynced.mjs
 */
import {
  defaultSyncOperation,
  pickUnsyncedRecordsForEnqueue,
  recordForPush,
  resolveAfterPushAck,
  shouldEnqueueUnsyncedRecord,
} from '../src/lib/syncUnsyncedCore.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const pendingMemberships = new Set(['m1'])
const rows = [
  { id: 't1', synced: false, client_id: 'c1' },
  { id: 't2', synced: true, client_id: 'c1' },
  { id: 't3', client_id: 'c1' },
  { id: 'm1', synced: false, client_id: 'c1' },
  { id: 'm2', synced: false, client_id: 'c1' },
]

assert(shouldEnqueueUnsyncedRecord(rows[0], new Set(), 'trainings'), 'unsynced training')
assert(!shouldEnqueueUnsyncedRecord(rows[1], new Set(), 'trainings'), 'synced training skip')
assert(shouldEnqueueUnsyncedRecord(rows[2], new Set(), 'trainings'), 'legacy missing synced enqueue')
assert(!shouldEnqueueUnsyncedRecord(rows[2], new Set(['t3']), 'trainings'), 'legacy skip when pending')
assert(!shouldEnqueueUnsyncedRecord(rows[3], pendingMemberships, 'memberships'), 'already pending skip')
assert(pickUnsyncedRecordsForEnqueue(rows.slice(0, 3), new Set(), 'trainings').length === 2, 'pick two trainings')
assert(pickUnsyncedRecordsForEnqueue(rows.slice(3), pendingMemberships, 'memberships').length === 1, 'pick m2 only')

const push = recordForPush({ id: 't1', synced: false, __sync: { operation: 'insert' }, date: '2026-05-01' })
assert(push.id === 't1' && push.date === '2026-05-01' && push.synced === undefined && push.__sync === undefined, 'strip meta for push')
const challengePush = recordForPush({
  id: 'ch1',
  club_id: 'club-1',
  synced: true,
  __sync: { operation: 'insert' },
})
assert(
  challengePush.id === 'ch1' && challengePush.club_id === 'club-1' && challengePush.synced === undefined,
  'challenge local synced never goes to PostgREST',
)
assert(!shouldEnqueueUnsyncedRecord({ id: 'ch1', synced: true }, new Set(), 'challenges'), 'synced challenge skip re-push')
assert(shouldEnqueueUnsyncedRecord({ id: 'ch2', synced: false }, new Set(), 'challenges'), 'unsynced challenge still pushed')

assert(defaultSyncOperation('trainings', { id: 'x' }).operation === 'insert', 'trainings default insert')
assert(defaultSyncOperation('memberships', { id: 'x' }).operation === 'update', 'memberships default update')

{
  const local = { id: 't1', updated_at: '2026-08-27T14:00:00.000Z', status: 'completed' }
  const cloud = { id: 't1', updated_at: '2026-08-27T13:00:00.000Z', status: 'completed' }
  const pushed = { id: 't1', updated_at: '2026-08-27T14:00:00.000Z', status: 'completed' }
  const d = resolveAfterPushAck({ localRow: local, cloudRow: cloud, pushedData: pushed, recordKey: 't1' })
  assert(d.action === 'mark_local_synced', '409: local same as pushed → mark synced (no sticky local-only)')
}

{
  const local = { id: 't1', updated_at: '2026-08-27T14:05:00.000Z' }
  const cloud = { id: 't1', updated_at: '2026-08-27T14:00:00.000Z' }
  const pushed = { id: 't1', updated_at: '2026-08-27T14:00:00.000Z' }
  const d = resolveAfterPushAck({ localRow: local, cloudRow: cloud, pushedData: pushed, recordKey: 't1' })
  assert(d.action === 'keep_local_needs_update' && d.remote_id === 't1', 'edit in flight → update meta')
}

{
  const local = { id: 't1', updated_at: '2026-08-27T13:00:00.000Z' }
  const cloud = { id: 't1', updated_at: '2026-08-27T14:00:00.000Z' }
  const d = resolveAfterPushAck({ localRow: local, cloudRow: cloud, pushedData: local, recordKey: 't1' })
  assert(d.action === 'use_cloud', 'cloud newer → take cloud')
}

{
  const local = { id: 't1', updated_at: '2026-09-09T12:00:00.000Z', status: 'completed' }
  const cloud = { id: 't1', updated_at: '2026-09-09T12:01:00.000Z', status: 'draft' }
  const d = resolveAfterPushAck({ localRow: local, cloudRow: cloud, pushedData: cloud, recordKey: 't1' })
  assert(
    d.action === 'keep_local_needs_update' && d.remote_id === 't1',
    'late draft ack must not uncomplete local completed',
  )
}

/* INC-2026-10-11-03: ack старого автосейва пришёл, когда на планшете уже новая правка. */
{
  const pushed = { id: 't1', updated_at: '2026-10-11T18:50:53.700Z', status: 'draft' }
  const local = { id: 't1', updated_at: '2026-10-11T18:50:53.763Z', status: 'draft' }
  const cloud = { id: 't1', updated_at: '2026-10-11T18:50:53.837Z', status: 'draft' }
  const d = resolveAfterPushAck({ localRow: local, cloudRow: cloud, pushedData: pushed, recordKey: 't1' })
  assert(
    d.action === 'keep_local_needs_update' && d.remote_id === 't1',
    'CRITICAL: ack older push (server NOW stamp) does not overwrite newer local edit',
  )
}

{
  const pushed = { id: 't1', updated_at: '2026-10-11T18:50:53.700Z', status: 'draft' }
  const local = { id: 't1', updated_at: '2026-10-11T18:50:53.763Z', status: 'draft' }
  const cloud = { id: 't1', updated_at: '2026-10-11T18:50:53.837Z', status: 'completed' }
  const d = resolveAfterPushAck({ localRow: local, cloudRow: cloud, pushedData: pushed, recordKey: 't1' })
  assert(d.action === 'use_cloud', 'completed in cloud still wins over local draft edit')
}

{
  const same = { id: 't1', updated_at: '2026-10-11T18:50:53.763Z', status: 'draft' }
  const cloud = { id: 't1', updated_at: '2026-10-11T18:50:53.838Z', status: 'draft' }
  const d = resolveAfterPushAck({ localRow: same, cloudRow: cloud, pushedData: same, recordKey: 't1' })
  assert(d.action === 'use_cloud', 'ack of the latest push → take server stamp')
}

/* INC-2026-10-11-03: второй insert до ack первого → сервер «дубликат», в облаке старая форма. */
{
  const pushed = {
    id: 't1',
    updated_at: '2026-10-11T18:50:55.000Z',
    status: 'draft',
    date: '2026-10-11',
    data: { workoutState: { training_focus: 'Сила', pre_weight_kg: '62' } },
  }
  const cloud = {
    id: 't1',
    updated_at: '2026-10-11T18:50:56.000Z',
    status: 'draft',
    date: '2026-10-11',
    data: { workoutState: { pre_weight_kg: '62', training_focus: '' } },
  }
  const d = resolveAfterPushAck({
    localRow: pushed,
    cloudRow: cloud,
    pushedData: pushed,
    recordKey: 't1',
    tableName: 'trainings',
    duplicate: true,
  })
  assert(
    d.action === 'keep_local_needs_update' && d.requeue === true && d.remote_id === 't1',
    'CRITICAL: duplicate insert with stale cloud form → requeue as update',
  )

  const sameReordered = { ...cloud, data: { workoutState: { training_focus: 'Сила', pre_weight_kg: '62' } } }
  const reorderedPushed = { ...pushed, data: { workoutState: { pre_weight_kg: '62', training_focus: 'Сила' } } }
  const d2 = resolveAfterPushAck({
    localRow: reorderedPushed,
    cloudRow: sameReordered,
    pushedData: reorderedPushed,
    recordKey: 't1',
    tableName: 'trainings',
    duplicate: true,
  })
  assert(d2.action === 'use_cloud', 'duplicate with same content (jsonb key order) → no extra update')

  const d3 = resolveAfterPushAck({
    localRow: pushed,
    cloudRow: { ...cloud, status: 'completed' },
    pushedData: pushed,
    recordKey: 't1',
    tableName: 'trainings',
    duplicate: true,
  })
  assert(d3.action === 'use_cloud', 'duplicate: completed in cloud wins over local draft')

  const d4 = resolveAfterPushAck({ localRow: pushed, cloudRow: cloud, pushedData: pushed, recordKey: 't1', tableName: 'trainings' })
  assert(d4.action !== 'keep_local_needs_update' || d4.requeue !== true, 'no duplicate flag → no requeue')
  assert(d.requeue_from === 'local', 'duplicate requeue: local same as pushed → from local')

  const olderLocal = { ...pushed, updated_at: '2026-10-11T18:50:50.000Z' }
  const d5 = resolveAfterPushAck({
    localRow: olderLocal,
    cloudRow: cloud,
    pushedData: pushed,
    recordKey: 't1',
    tableName: 'trainings',
    duplicate: true,
  })
  assert(
    d5.action === 'keep_local_needs_update' && d5.requeue_from === 'pushed',
    'duplicate requeue: pushed newer than local → resend pushed (newest known form)',
  )
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll sync unsynced checks passed.')
