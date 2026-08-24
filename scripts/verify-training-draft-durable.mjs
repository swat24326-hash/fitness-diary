/**
 * node scripts/verify-training-draft-durable.mjs
 */
import {
  buildTrainingDraftDurableSnap,
  draftRevisionMs,
  idbTrainingRevisionMs,
  resolveTrainingDraftDurableKey,
  shouldClearDurableAfterIdbSave,
  shouldFlushDraftOnPageHide,
  shouldPreferDurableDraftOverIdb,
} from '../src/lib/trainingDraftDurableCore.js'
import {
  hasFreshTrainingDraftDurableInStorage,
  listTrainingDraftDurables,
  putTrainingDraftDurable,
  clearTrainingDraftDurable,
} from '../src/lib/trainingDraftDurableStorage.js'

const store = new Map()
globalThis.localStorage = {
  getItem(k) {
    return store.has(k) ? store.get(k) : null
  },
  setItem(k, v) {
    store.set(String(k), String(v))
  },
  removeItem(k) {
    store.delete(k)
  },
  get length() {
    return store.size
  },
  key(i) {
    return [...store.keys()][i] ?? null
  },
}

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

console.log('--- hide flush ---')
ok(shouldFlushDraftOnPageHide('hidden'), 'A1 hidden → flush')
ok(!shouldFlushDraftOnPageHide('visible'), 'A2 visible → no flush')
ok(shouldFlushDraftOnPageHide('visible', { eventType: 'pagehide' }), 'A3 pagehide always flush')

console.log('--- durable key ---')
ok(resolveTrainingDraftDurableKey({ trainingId: 't1', clientId: 'c1' }) === 't1', 'B1 uuid key')
ok(resolveTrainingDraftDurableKey({ trainingId: 'new', clientId: 'c1' }) === 'new:c1', 'B2 new key')
ok(resolveTrainingDraftDurableKey({ clientId: 'c1', isNew: true }) === 'new:c1', 'B3 new by client')
ok(resolveTrainingDraftDurableKey({}) === '', 'B4 empty')

console.log('--- build snap ---')
ok(
  buildTrainingDraftDurableSnap({
    clientId: 'c1',
    trainingId: 't1',
    workoutState: { exercises: [{ name: 'Squat' }] },
    revisedAt: '2026-08-24T12:00:00.000Z',
  })?.clientId === 'c1',
  'C1 build ok',
)
ok(
  buildTrainingDraftDurableSnap({
    clientId: 'c1',
    status: 'completed',
    workoutState: {},
  }) === null,
  'C2 no snap for completed',
)
ok(buildTrainingDraftDurableSnap({ trainingId: 't1' }) === null, 'C3 needs client')

console.log('--- prefer durable over idb ---')
ok(
  shouldPreferDurableDraftOverIdb({
    durable: {
      clientId: 'c1',
      trainingId: 't1',
      status: 'draft',
      revisedAt: '2026-08-24T12:05:00.000Z',
      workoutState: { exercises: [{ name: 'Last' }] },
    },
    idbRow: {
      id: 't1',
      client_id: 'c1',
      status: 'draft',
      updated_at: '2026-08-24T12:00:00.000Z',
      data: { exercises: [{ name: 'Old' }] },
    },
    expectClientId: 'c1',
    expectTrainingId: 't1',
  }),
  'D1 CRITICAL: newer durable after screen lock wins',
)
ok(
  !shouldPreferDurableDraftOverIdb({
    durable: {
      clientId: 'c1',
      trainingId: 't1',
      status: 'draft',
      revisedAt: '2026-08-24T11:00:00.000Z',
      workoutState: { exercises: [{ name: 'Stale' }] },
    },
    idbRow: {
      id: 't1',
      client_id: 'c1',
      status: 'draft',
      updated_at: '2026-08-24T12:00:00.000Z',
      data: { exercises: [{ name: 'FreshIdb' }] },
    },
    expectTrainingId: 't1',
  }),
  'D2 older durable loses',
)
ok(
  !shouldPreferDurableDraftOverIdb({
    durable: {
      clientId: 'c1',
      trainingId: 't1',
      status: 'draft',
      revisedAt: '2026-08-24T13:00:00.000Z',
      workoutState: { exercises: [{ name: 'X' }] },
    },
    idbRow: {
      id: 't1',
      client_id: 'c1',
      status: 'completed',
      updated_at: '2026-08-24T12:00:00.000Z',
      data: { exercises: [{ name: 'Done' }] },
    },
    expectTrainingId: 't1',
  }),
  'D3 never override completed',
)
ok(
  !shouldPreferDurableDraftOverIdb({
    durable: {
      clientId: 'c2',
      trainingId: 't1',
      status: 'draft',
      revisedAt: '2026-08-24T13:00:00.000Z',
      workoutState: {},
    },
    idbRow: { id: 't1', client_id: 'c1', status: 'draft', updated_at: '2026-08-24T12:00:00.000Z' },
    expectClientId: 'c1',
    expectTrainingId: 't1',
  }),
  'D4 foreign client rejected',
)
ok(
  shouldPreferDurableDraftOverIdb({
    durable: {
      clientId: 'c1',
      trainingId: null,
      status: 'draft',
      revisedAt: '2026-08-24T12:00:00.000Z',
      workoutState: { exercises: [{ name: 'NewDraft' }] },
    },
    idbRow: null,
    expectClientId: 'c1',
  }),
  'D5 /new only durable',
)

console.log('--- clear after save ---')
ok(
  shouldClearDurableAfterIdbSave({
    durable: { revisedAt: '2026-08-24T12:00:00.000Z' },
    idbUpdatedAt: '2026-08-24T12:01:00.000Z',
  }),
  'E1 clear when idb caught up',
)
ok(
  !shouldClearDurableAfterIdbSave({
    durable: { revisedAt: '2026-08-24T12:05:00.000Z' },
    idbUpdatedAt: '2026-08-24T12:01:00.000Z',
  }),
  'E2 keep if durable still newer (typed after save start)',
)

ok(draftRevisionMs('2026-08-24T12:00:00.000Z') > 0, 'F1 parse iso')
ok(idbTrainingRevisionMs({ updated_at: 'bad', created_at: '2026-08-24T12:00:00.000Z' }) > 0, 'F2 fallback created_at')

clearTrainingDraftDurable({ trainingId: 't-fresh', clientId: 'c1' })
putTrainingDraftDurable(
  { trainingId: 't-fresh', clientId: 'c1' },
  {
    trainingId: 't-fresh',
    clientId: 'c1',
    workoutState: { exercises: [{ name: 'A' }] },
    revisedAt: new Date().toISOString(),
  },
)
ok(listTrainingDraftDurables().some((s) => s.trainingId === 't-fresh'), 'G1 list durable')
ok(hasFreshTrainingDraftDurableInStorage(), 'G2 fresh durable blocks PWA')
clearTrainingDraftDurable({ trainingId: 't-fresh', clientId: 'c1' })

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll training-draft-durable checks passed')
