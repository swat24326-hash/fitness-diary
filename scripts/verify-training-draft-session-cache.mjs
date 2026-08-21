/**
 * node scripts/verify-training-draft-session-cache.mjs
 */
import {
  TRAINING_DRAFT_SESSION_CACHE_MAX,
  buildTrainingDraftSessionSnapshot,
  clearTrainingDraftSessionCache,
  dropTrainingDraftSession,
  isTrainingDraftSessionSnapshotReady,
  peekTrainingDraftSession,
  putTrainingDraftSession,
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

ok(!putTrainingDraftSession('new', { ready: true, meta: { trainingId: 'new' } }), 'reject new key')
ok(!isTrainingDraftSessionSnapshotReady(null), 'ready null')
ok(!isTrainingDraftSessionSnapshotReady({ loadState: 'ok' }), 'ready needs trainingId')
ok(
  isTrainingDraftSessionSnapshotReady({ loadState: 'ok', meta: { trainingId: 't1' } }, 't1'),
  'ready ok expect id',
)
ok(
  !isTrainingDraftSessionSnapshotReady({ loadState: 'ok', meta: { trainingId: 't1' } }, 't2'),
  'ready reject foreign id',
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
built.workoutState.exercises[0].name = 'MUTATED'
ok(
  buildTrainingDraftSessionSnapshot({
    loadState: 'ok',
    meta: { trainingId: 't1' },
    workoutState: { exercises: [{ id: 'e1', name: 'Жим', sets: [] }] },
  })?.workoutState?.exercises?.[0]?.name === 'Жим',
  'build clones',
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
    workoutState: {},
  })
}
ok(trainingDraftSessionCacheSize() === TRAINING_DRAFT_SESSION_CACHE_MAX, 'lru cap')
ok(peekTrainingDraftSession('x0') == null, 'oldest evicted')

ok(dropTrainingDraftSession('x5') === true, 'drop')
ok(peekTrainingDraftSession('x5') == null, 'dropped')

ok(buildTrainingDraftSessionSnapshot({ loadState: 'loading', meta: { trainingId: 't' } }) == null, 'no build while loading')

clearTrainingDraftSessionCache()
ok(trainingDraftSessionCacheSize() === 0, 'cleared')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-draft-session-cache: all passed')
