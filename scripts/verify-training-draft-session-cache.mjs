/**
 * node scripts/verify-training-draft-session-cache.mjs
 */
import {
  TRAINING_DRAFT_SESSION_CACHE_MAX,
  buildTrainingDraftSessionSnapshot,
  clearTrainingDraftSessionCache,
  dropTrainingDraftSession,
  isTrainingDraftSessionSnapshotReady,
  isTrainingDraftUiAligned,
  peekTrainingDraftSession,
  putTrainingDraftSession,
  shouldBlockMismatchedDraftPersist,
  takeTrainingDraftSession,
  trainingDraftSessionCacheSize,
} from '../src/lib/trainingDraftSessionCache.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

clearTrainingDraftSessionCache()

ok(
  !isTrainingDraftUiAligned({
    loadState: 'ok',
    routeId: 'draft-b',
    metaTrainingId: 'draft-a',
  }),
  'ui not aligned across drafts (leak frame)',
)
ok(
  isTrainingDraftUiAligned({
    loadState: 'ok',
    routeId: 'draft-a',
    metaTrainingId: 'draft-a',
  }),
  'ui aligned same draft',
)
ok(
  !isTrainingDraftUiAligned({
    loadState: 'loading',
    routeId: 'draft-a',
    metaTrainingId: 'draft-a',
  }),
  'ui hidden while loading',
)
ok(
  isTrainingDraftUiAligned({ loadState: 'ok', isNew: true, clientId: 'c1' }),
  'ui new with client',
)
ok(
  !isTrainingDraftUiAligned({ loadState: 'ok', isNew: true, clientId: '' }),
  'ui new without client',
)

ok(shouldBlockMismatchedDraftPersist({ silent: true, routeId: 'b', metaTrainingId: 'a' }), 'block mismatched silent')
ok(!shouldBlockMismatchedDraftPersist({ silent: false, routeId: 'b', metaTrainingId: 'a' }), 'allow explicit save check elsewhere')
ok(!shouldBlockMismatchedDraftPersist({ silent: true, routeId: 'a', metaTrainingId: 'a' }), 'aligned silent ok')

ok(!putTrainingDraftSession('new', { ready: true, meta: { trainingId: 'new' } }), 'reject new key')
ok(!isTrainingDraftSessionSnapshotReady(null), 'ready null')
ok(!isTrainingDraftSessionSnapshotReady({ loadState: 'ok' }), 'ready needs trainingId')
ok(
  isTrainingDraftSessionSnapshotReady({ loadState: 'ok', meta: { trainingId: 't1' }, client: { id: 'c1' } }, 't1'),
  'ready ok expect id',
)
ok(
  !isTrainingDraftSessionSnapshotReady({ loadState: 'ok', meta: { trainingId: 't1' } }, 't2'),
  'ready reject foreign id',
)
ok(
  !isTrainingDraftSessionSnapshotReady(
    { loadState: 'ok', meta: { trainingId: 't1' }, client: { id: 'c1' } },
    { trainingId: 't1', clientId: 'c2' },
  ),
  'ready reject foreign client',
)

const built = buildTrainingDraftSessionSnapshot({
  loadState: 'ok',
  meta: { status: 'draft', trainingId: 't1' },
  workoutState: { exercises: [{ id: 'e1', name: 'Жим', sets: [] }] },
  trainingType: 'Силовая',
  trainingDate: '2026-08-21',
  client: { id: 'c1', name: 'Иванов' },
  healthCard: { weight_kg: 80 },
  contra: 'колено',
  membershipSummary: { current: 1, total: 12 },
  otherCompletedTrainings: 2,
  lateBlockedNotice: '',
})
ok(built?.meta?.trainingId === 't1', 'build snapshot')
ok(built?.workoutState?.exercises?.[0]?.name === 'Жим', 'build workout')
ok(
  buildTrainingDraftSessionSnapshot({
    loadState: 'ok',
    meta: { trainingId: 't1' },
    workoutState: { exercises: [{ id: 'e1', name: 'Жим', sets: [] }] },
    client: null,
  }) == null,
  'build requires client',
)

ok(putTrainingDraftSession('t1', built), 'put t1')
ok(peekTrainingDraftSession('t1')?.client?.name === 'Иванов', 'peek t1')
const taken = takeTrainingDraftSession('t1')
ok(taken?.contra === 'колено', 'take t1')
taken.contra = 'hack'
ok(peekTrainingDraftSession('t1')?.contra === 'колено', 'cache not aliased')

for (let i = 0; i < TRAINING_DRAFT_SESSION_CACHE_MAX + 3; i++) {
  putTrainingDraftSession(`x${i}`, {
    ready: true,
    loadState: 'ok',
    meta: { trainingId: `x${i}` },
    client: { id: `c${i}` },
    workoutState: {},
  })
}
ok(trainingDraftSessionCacheSize() === TRAINING_DRAFT_SESSION_CACHE_MAX, 'lru cap')
ok(peekTrainingDraftSession('x0') == null, 'oldest evicted')

ok(dropTrainingDraftSession('x5') === true, 'drop')
ok(peekTrainingDraftSession('x5') == null, 'dropped')

ok(buildTrainingDraftSessionSnapshot({ loadState: 'loading', meta: { trainingId: 't' }, client: { id: 'c' } }) == null, 'no build while loading')

clearTrainingDraftSessionCache()
ok(trainingDraftSessionCacheSize() === 0, 'cleared')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-draft-session-cache: all passed')
