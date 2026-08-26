/**
 * node scripts/verify-client-memberships-prune.mjs
 *
 * Orphan-prune абонементов после hydrate / Sync (удалённые в облаке ghost-строки в IDB).
 */
import {
  isMembershipWithinOrphanPruneGrace,
  membershipIdsToPruneForClient,
  membershipIdsToPruneForClients,
  shouldSkipClientMembershipsOrphanPrune,
  MEMBERSHIP_ORPHAN_PRUNE_GRACE_MS,
} from '../src/lib/clientMembershipsPrune.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const clientId = 'c1'
const remote = [
  { id: 'm1', client_id: clientId },
  { id: 'm2', client_id: clientId },
]
const local = [
  { id: 'm1', client_id: clientId },
  { id: 'm2', client_id: clientId },
  { id: 'ghost-0-0', client_id: clientId },
  { id: 'other', client_id: 'c2' },
]

console.log('--- A: базовый orphan (Tsarkov 0/0) ---')
assert(
  membershipIdsToPruneForClient(clientId, local, remote, new Set()).join(',') === 'ghost-0-0',
  'A1 prune local ghost not on server',
)
assert(
  membershipIdsToPruneForClient(clientId, local, remote, new Set(['ghost-0-0'])).length === 0,
  'A2 keep ghost when pending in queue',
)
assert(
  membershipIdsToPruneForClient(clientId, local, remote, new Set(['m1'])).join(',') === 'ghost-0-0',
  'A3 pending on other row does not block ghost prune',
)
assert(membershipIdsToPruneForClient('', local, remote, new Set()).length === 0, 'A4 empty client id')

console.log('--- B: только на устройстве ---')
assert(
  membershipIdsToPruneForClient(
    clientId,
    [...local, { id: 'localOnly', client_id: clientId, synced: false }],
    remote,
    new Set(),
  ).join(',') === 'ghost-0-0',
  'B1 CRITICAL: never prune synced:false',
)

console.log('--- C: grace после flush ---')
const now = Date.parse('2026-08-26T12:00:00.000Z')
assert(MEMBERSHIP_ORPHAN_PRUNE_GRACE_MS >= 60_000, 'C0 grace at least 60s')
assert(
  isMembershipWithinOrphanPruneGrace(
    { updated_at: '2026-08-26T11:59:30.000Z' },
    now,
    MEMBERSHIP_ORPHAN_PRUNE_GRACE_MS,
  ),
  'C1 fresh inside grace',
)
assert(
  membershipIdsToPruneForClient(
    clientId,
    [
      {
        id: 'just-pushed',
        client_id: clientId,
        synced: true,
        updated_at: '2026-08-26T11:59:50.000Z',
      },
    ],
    [],
    new Set(),
    { nowMs: now },
  ).length === 0,
  'C2 empty cloud right after flush — keep fresh',
)
assert(
  membershipIdsToPruneForClient(
    clientId,
    [
      {
        id: 'old-ghost',
        client_id: clientId,
        synced: true,
        updated_at: '2026-08-01T10:00:00.000Z',
      },
    ],
    [],
    new Set(),
    { nowMs: now },
  ).join(',') === 'old-ghost',
  'C3 empty cloud + old → prune (real delete on server)',
)

console.log('--- D: truncated / multi ---')
assert(
  shouldSkipClientMembershipsOrphanPrune({ truncated: true }),
  'D1 truncated → skip',
)
assert(
  membershipIdsToPruneForClients(
    [clientId, 'c2'],
    local,
    remote,
    new Set(),
  ).join(',') === 'ghost-0-0,other',
  'D2 multi-client: prune ghosts for both (c2 has empty remote)',
)
assert(
  membershipIdsToPruneForClients([clientId], local, remote, new Set(), { truncated: true }).length === 0,
  'D3 truncated multi → no prune',
)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll client memberships prune checks passed.')
