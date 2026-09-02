/**
 * node scripts/verify-training-draft-tab-switch.mjs
 */
import { clearTrainingDraftSessionCache, peekTrainingDraftSession, putTrainingDraftSession } from '../src/lib/trainingDraftSessionCache.js'
import {
  buildLeavingDraftSessionSnapshot,
  isLeavingDraftGateReady,
  isLiveDraftStorageAligned,
  putLeavingDraftSessionOnTabSwitch,
  shouldFlushLeavingDraftOnTabSwitch,
  simulateDraftTabRoundTrip,
} from '../src/lib/trainingDraftTabSwitchCore.js'
import { shouldBlockMismatchedDraftPersist } from '../src/lib/trainingDraftSessionCache.js'
import { pickTrainingDraftRestore, workoutDraftContentScore } from '../src/lib/trainingDraftRestoreCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

clearTrainingDraftSessionCache()

const richWorkout = {
  training_focus: 'Ноги ягодицы',
  exercises: [{ id: 'e1', name: 'Присед', sets: [{ reps: '12', weight: '40' }] }],
}

const staleGateSnap = {
  ready: true,
  loadState: 'ok',
  meta: { status: 'draft', trainingId: 'draft-a' },
  client: { id: 'c-a', name: 'Шалаева' },
  workoutState: { training_focus: '', exercises: [] },
  trainingType: 'Силовая',
  trainingDate: '2026-08-31',
}

const liveA = {
  loadState: 'ok',
  routeId: 'draft-a',
  clientIdParam: 'c-a',
  meta: { status: 'draft', trainingId: 'draft-a' },
  client: { id: 'c-a', name: 'Шалаева' },
  workoutState: richWorkout,
  trainingType: 'Силовая',
  trainingDate: '2026-08-31',
}

const snap = buildLeavingDraftSessionSnapshot('draft-a', {
  live: liveA,
  gate: { id: 'draft-a', snap: staleGateSnap },
})

ok(snap?.meta?.trainingId === 'draft-a', 'leaving snap keeps training id')
ok(
  workoutDraftContentScore(snap?.workoutState) > workoutDraftContentScore(staleGateSnap.workoutState),
  'live wins over stale gate (Шалаева → Крофта)',
)
ok(snap?.workoutState?.exercises?.[0]?.name === 'Присед', 'exercises preserved on tab switch')

putTrainingDraftSession('draft-a', snap)
ok(peekTrainingDraftSession('draft-a')?.workoutState?.exercises?.[0]?.name === 'Присед', 'session cache has rich draft')

ok(
  shouldFlushLeavingDraftOnTabSwitch('draft-a', { live: liveA, gate: { id: 'draft-a', snap: staleGateSnap }, nextRouteId: 'draft-b' }),
  'flush when switching to another draft',
)
ok(
  !shouldFlushLeavingDraftOnTabSwitch('draft-a', { live: liveA, gate: { id: 'draft-a', snap: staleGateSnap }, nextRouteId: 'draft-a' }),
  'no flush when same draft',
)

ok(
  buildLeavingDraftSessionSnapshot('draft-a', {
    live: { ...liveA, meta: { trainingId: 'draft-b' } },
    gate: { id: 'draft-a', snap: staleGateSnap },
  })?.workoutState?.exercises?.length === 0,
  'fallback to gate when live already on other tab',
)

ok(putLeavingDraftSessionOnTabSwitch('draft-a', { live: liveA, gate: { id: 'draft-a', snap: staleGateSnap } }), 'sync put on tab leave')

const gateAlreadyOnB = buildLeavingDraftSessionSnapshot('draft-a', {
  live: {
    loadState: 'ok',
    meta: { status: 'draft', trainingId: 'draft-b' },
    client: { id: 'c-b', name: 'Куриленко' },
    workoutState: richWorkout,
    trainingType: 'Силовая',
    trainingDate: '2026-08-31',
  },
  gate: {
    id: 'draft-b',
    snap: {
      ready: true,
      loadState: 'ok',
      meta: { status: 'draft', trainingId: 'draft-b' },
      client: { id: 'c-b' },
      workoutState: { exercises: [] },
      trainingType: 'Силовая',
      trainingDate: '2026-08-31',
    },
  },
})
ok(gateAlreadyOnB == null, 'CRITICAL: gate on new tab — no snap from poisoned live (Маханенков→Куриленко)')
ok(!isLeavingDraftGateReady('draft-a', { id: 'draft-b' }), 'durable flush blocked when gate on other tab')

const crossClientPick = pickTrainingDraftRestore({
  expectClientId: 'c-b',
  durable: {
    clientId: 'c-a',
    trainingId: 'draft-a',
    status: 'draft',
    workoutState: richWorkout,
  },
})
ok(crossClientPick.source === 'empty', 'restore skips durable from another client')

ok(
  isLiveDraftStorageAligned({
    loadState: 'ok',
    routeId: 'draft-a',
    clientIdParam: 'c-a',
    meta: { trainingId: 'draft-a' },
    client: { id: 'c-a' },
  }),
  'storage aligned when route/meta/client match',
)
ok(
  !isLiveDraftStorageAligned({
    loadState: 'ok',
    routeId: 'draft-b',
    clientIdParam: 'c-b',
    meta: { trainingId: 'draft-b' },
    client: { id: 'c-a' },
  }),
  'storage blocked when URL client ≠ state client',
)
ok(
  !isLiveDraftStorageAligned({
    loadState: 'ok',
    routeId: 'draft-b',
    clientIdParam: 'c-b',
    meta: { trainingId: 'draft-a' },
    client: { id: 'c-b' },
  }),
  'storage blocked when route ≠ meta during tab switch',
)

const liveB = {
  loadState: 'ok',
  routeId: 'draft-b',
  clientIdParam: 'c-b',
  meta: { status: 'draft', trainingId: 'draft-b' },
  client: { id: 'c-b', name: 'Крофта' },
  workoutState: {
    training_focus: 'Спина',
    exercises: [{ id: 'e2', name: 'Тяга', sets: [{ reps: '10', weight: '30' }] }],
  },
  trainingType: 'Силовая',
  trainingDate: '2026-08-31',
}

clearTrainingDraftSessionCache()
const roundTrip = simulateDraftTabRoundTrip({
  draftA: 'draft-a',
  draftB: 'draft-b',
  liveA,
  liveB,
  gateA: { id: 'draft-a', snap: staleGateSnap },
  gateB: { id: 'draft-b', snap: { ...staleGateSnap, meta: { trainingId: 'draft-b' }, client: { id: 'c-b' } } },
})
ok(roundTrip.restoredA?.workoutState?.exercises?.[0]?.name === 'Присед', 'round-trip A→B→A: Шалаева exercises')
ok(roundTrip.restoredB?.workoutState?.exercises?.[0]?.name === 'Тяга', 'round-trip: Крофта exercises intact')

ok(
  shouldBlockMismatchedDraftPersist({ silent: true, routeId: 'draft-a', metaTrainingId: '' }),
  'CRITICAL: no silent IDB write while meta hydrating',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-draft-tab-switch: all passed')
