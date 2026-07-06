import {
  buildPendingMembershipTypeKeys,
  shouldApplyRemoteMembershipTypeRow,
  shouldDeleteLocalMembershipTypeRow,
} from '../src/lib/membershipTypesMergeCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const remoteIds = new Set(['cloud-1', 'cloud-2'])
const queueInsert = [
  {
    table_name: 'membership_types',
    operation: 'insert',
    remote_id: null,
    data: { id: 'local-new-az' },
  },
]
const queueUpdate = [
  {
    table_name: 'membership_types',
    operation: 'update',
    remote_id: 'cloud-1',
    data: { id: 'cloud-1' },
  },
]

const { pendingInserts, pendingUpdates } = buildPendingMembershipTypeKeys(queueInsert)
ok(pendingInserts.has('local-new-az'), 'pending insert detected')
ok(pendingUpdates.size === 0, 'no pending update from insert-only queue')

const fromUpdate = buildPendingMembershipTypeKeys(queueUpdate)
ok(fromUpdate.pendingUpdates.has('cloud-1'), 'pending update detected')

ok(
  !shouldDeleteLocalMembershipTypeRow({
    id: 'local-new-az',
    remoteIds,
    forceFromCloud: true,
    pendingUpdates: pendingInserts,
    pendingInserts,
  }),
  'forceFromCloud: do not delete unsynced insert',
)

ok(
  shouldDeleteLocalMembershipTypeRow({
    id: 'orphan-local',
    remoteIds,
    forceFromCloud: true,
    pendingUpdates: new Set(),
    pendingInserts: new Set(),
  }),
  'forceFromCloud: delete orphan not in cloud',
)

ok(
  !shouldDeleteLocalMembershipTypeRow({
    id: 'cloud-1',
    remoteIds,
    forceFromCloud: false,
    pendingUpdates: fromUpdate.pendingUpdates,
    pendingInserts: new Set(),
  }),
  'normal merge: keep local with pending update',
)

ok(
  shouldApplyRemoteMembershipTypeRow({
    id: 'cloud-1',
    forceFromCloud: true,
    pendingUpdates: fromUpdate.pendingUpdates,
    pendingInserts: new Set(),
  }),
  'forceFromCloud: overwrite stale pending update from cloud',
)

ok(
  !shouldApplyRemoteMembershipTypeRow({
    id: 'local-new-az',
    forceFromCloud: true,
    pendingUpdates: new Set(),
    pendingInserts,
  }),
  'forceFromCloud: never overwrite pending insert row',
)

process.exit(failed > 0 ? 1 : 0)
