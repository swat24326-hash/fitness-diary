/**
 * node scripts/verify-client-trainings-prune.mjs
 *
 * Критические сценарии orphan-prune дневника (hydrate / Sync).
 */
import {
  isTrainingWithinOrphanPruneGrace,
  shouldSkipClientTrainingsOrphanPrune,
  trainingIdsToPruneForClient,
  TRAINING_ORPHAN_PRUNE_GRACE_MS,
} from '../src/lib/clientTrainingsPrune.js'

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
  { id: 't1', client_id: clientId },
  { id: 't2', client_id: clientId },
]
const local = [
  { id: 't1', client_id: clientId },
  { id: 't2', client_id: clientId },
  { id: 'ghost', client_id: clientId },
  { id: 'other', client_id: 'c2' },
]

console.log('--- A: базовый orphan ---')
assert(
  trainingIdsToPruneForClient(clientId, local, remote, new Set()).join(',') === 'ghost',
  'A1 prune local ghost not on server',
)
assert(
  trainingIdsToPruneForClient(clientId, local, remote, new Set(['ghost'])).length === 0,
  'A2 keep ghost when pending in queue',
)
assert(
  trainingIdsToPruneForClient(clientId, local, remote, new Set(['t1'])).join(',') === 'ghost',
  'A3 pending on other row does not block ghost prune',
)
assert(trainingIdsToPruneForClient('', local, remote, new Set()).length === 0, 'A4 empty client id')
assert(
  trainingIdsToPruneForClient('c2', local, [{ id: 'x', client_id: 'c2' }], new Set()).join(',') === 'other',
  'A5 prune only for requested client',
)

console.log('--- B: слабая сеть / только на устройстве ---')
assert(
  trainingIdsToPruneForClient(
    clientId,
    [...local, { id: 'draft1', client_id: clientId, status: 'draft' }],
    remote,
    new Set(),
  ).join(',') === 'ghost',
  'B1 never prune local draft',
)
assert(
  trainingIdsToPruneForClient(
    clientId,
    [...local, { id: 'localOnly', client_id: clientId, status: 'completed', synced: false }],
    remote,
    new Set(),
  ).join(',') === 'ghost',
  'B2 CRITICAL: never prune synced:false completed',
)
assert(
  trainingIdsToPruneForClient(
    clientId,
    [{ id: 'solo', client_id: clientId, status: 'completed', synced: false }],
    [],
    new Set(),
  ).length === 0,
  'B3 CRITICAL: empty cloud + synced:false → keep (3 clients / flaky Wi‑Fi)',
)

console.log('--- C: flush → hydrate race ---')
const now = Date.parse('2026-08-26T12:00:00.000Z')
assert(TRAINING_ORPHAN_PRUNE_GRACE_MS >= 60_000, 'C0 grace at least 60s')
assert(
  isTrainingWithinOrphanPruneGrace(
    { updated_at: '2026-08-26T11:59:30.000Z' },
    now,
    TRAINING_ORPHAN_PRUNE_GRACE_MS,
  ),
  'C1 fresh updated_at inside grace',
)
assert(
  !isTrainingWithinOrphanPruneGrace(
    { updated_at: '2026-08-26T11:00:00.000Z' },
    now,
    TRAINING_ORPHAN_PRUNE_GRACE_MS,
  ),
  'C2 old updated_at outside grace',
)
assert(
  trainingIdsToPruneForClient(
    clientId,
    [
      {
        id: 'just-pushed',
        client_id: clientId,
        status: 'completed',
        synced: true,
        updated_at: '2026-08-26T11:59:50.000Z',
      },
    ],
    [],
    new Set(),
    { nowMs: now },
  ).length === 0,
  'C3 CRITICAL: empty cloud right after flush — keep fresh synced:true',
)
assert(
  trainingIdsToPruneForClient(
    clientId,
    [
      {
        id: 'old-ghost',
        client_id: clientId,
        status: 'completed',
        synced: true,
        updated_at: '2026-08-01T10:00:00.000Z',
      },
    ],
    [],
    new Set(),
    { nowMs: now },
  ).join(',') === 'old-ghost',
  'C4 empty cloud + old synced:true → prune (real delete on server)',
)

console.log('--- D: truncated / skip ---')
assert(
  shouldSkipClientTrainingsOrphanPrune({ truncated: true, remoteTrainings: [{ id: 'a' }] }),
  'D1 truncated → skip prune',
)
assert(
  !shouldSkipClientTrainingsOrphanPrune({ truncated: false, remoteTrainings: [] }),
  'D2 full empty remote → allow prune path (row guards still apply)',
)

console.log('--- E: empty remote mixed ---')
assert(
  trainingIdsToPruneForClient(
    clientId,
    local,
    [],
    new Set(),
  ).join(',') === 't1,t2,ghost',
  'E1 empty remote prunes unmarked synced rows',
)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll client trainings prune checks passed.')
