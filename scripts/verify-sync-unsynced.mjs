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

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll sync unsynced checks passed.')
