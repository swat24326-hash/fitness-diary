/**
 * node scripts/verify-sync-pull-merge.mjs
 * Критические сценарии merge при pull/push (офлайн-тренер).
 */
import { trainingIdsToPruneForClient } from '../src/lib/clientTrainingsPrune.js'
import {
  cloudPutAllowedOnPull,
  rowRevisionMs,
  shouldApplyCloudRowOnPull,
  shouldPreserveLocalRowFromCloudPull,
} from '../src/lib/syncPullGuardCore.js'
import { hasOpenTrainingDraft, resetOpenTrainingDraftForTests, setOpenTrainingDraft } from '../src/lib/openTrainingDraftGuard.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error('FAIL:', msg)
    failed++
  }
}

console.log('--- Сценарий A: черновик на планшете, Sync с pull ---')
ok(
  shouldPreserveLocalRowFromCloudPull({ id: 't1', synced: false, status: 'draft' }, 'trainings'),
  'A1 synced:false draft preserved',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: { id: 't1', synced: true, status: 'draft', data: { exercises: [{ id: 'e1' }] } },
    cloudRow: { id: 't1', synced: true, status: 'draft', data: { exercises: [] } },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't1',
  }),
  'A2 draft: empty cloud does not overwrite local',
)

console.log('\n--- Сценарий B: flush снял очередь, pull completed ---')
const localCompleted = {
  id: 't2',
  synced: true,
  status: 'completed',
  updated_at: '2026-08-20T10:00:00.000Z',
  data: { exercises: [] },
}
const cloudNewer = {
  id: 't2',
  synced: true,
  status: 'completed',
  updated_at: '2026-08-22T12:00:00.000Z',
  data: { exercises: [{ id: 'e1' }] },
}
ok(
  shouldApplyCloudRowOnPull({
    localRow: localCompleted,
    cloudRow: cloudNewer,
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't2',
  }),
  'B1 completed: newer cloud applies',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: cloudNewer,
    cloudRow: localCompleted,
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't2',
  }),
  'B2 completed: stale cloud skipped',
)
ok(rowRevisionMs(cloudNewer) > rowRevisionMs(localCompleted), 'B3 revision ms ordering')

console.log('\n--- Сценарий B2: клиент ПНК — stale hydrate после «Клиент пришёл» ---')
const localVisitStarted = {
  id: 'c-pnk',
  synced: true,
  pnk_stage: 'health',
  updated_at: '2026-08-22T12:01:00.000Z',
  pnk_deliverables: { visit_started: true },
}
const cloudStaleWait = {
  id: 'c-pnk',
  synced: true,
  pnk_stage: 'contact',
  updated_at: '2026-08-22T12:00:00.000Z',
  pnk_deliverables: {},
}
ok(
  !shouldApplyCloudRowOnPull({
    localRow: localVisitStarted,
    cloudRow: cloudStaleWait,
    storeName: 'clients',
    pendingByStore: { clients: new Set() },
    recordKey: 'c-pnk',
  }),
  'B4 clients: older cloud does not roll back visit_started',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: localVisitStarted,
    cloudRow: { id: 'c-pnk', pnk_stage: 'contact', created_at: '2026-08-01T10:00:00.000Z' },
    storeName: 'clients',
    pendingByStore: { clients: new Set() },
    recordKey: 'c-pnk',
  }),
  'B5 clients: cloud without newer updated_at skipped',
)
ok(
  shouldApplyCloudRowOnPull({
    localRow: localVisitStarted,
    cloudRow: {
      ...localVisitStarted,
      updated_at: '2026-08-22T12:02:00.000Z',
      pnk_stage: 'nutrition',
    },
    storeName: 'clients',
    pendingByStore: { clients: new Set() },
    recordKey: 'c-pnk',
  }),
  'B6 clients: newer cloud applies',
)

console.log('\n--- Сценарий C: hydrate prune дневника клиента ---')
const localTrainings = [
  { id: 'on-server', client_id: 'c1', status: 'completed' },
  { id: 'ghost', client_id: 'c1', status: 'completed' },
  { id: 'draft-local', client_id: 'c1', status: 'draft' },
]
const remote = [{ id: 'on-server', client_id: 'c1' }]
const prune = trainingIdsToPruneForClient('c1', localTrainings, remote, new Set())
ok(prune.join(',') === 'ghost', 'C1 prune ghost completed only')
ok(!prune.includes('draft-local'), 'C2 never prune local draft')

console.log('\n--- Сценарий D: pending in queue ---')
ok(
  cloudPutAllowedOnPull('trainings', 't-p', { trainings: new Set(['t-p']) }) === false,
  'D1 queue pending blocks cloud put',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: { id: 't-p', synced: false, status: 'draft' },
    cloudRow: { id: 't-p', status: 'draft' },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set(['t-p']) },
    recordKey: 't-p',
  }),
  'D2 pending + draft blocked',
)

console.log('\n--- Сценарий E: открытый черновик — skip pull trainings ---')
resetOpenTrainingDraftForTests()
ok(!hasOpenTrainingDraft(), 'E1 no draft initially')
setOpenTrainingDraft('draft-99', 'c1')
ok(hasOpenTrainingDraft(), 'E2 draft registered for pull skip')
resetOpenTrainingDraftForTests()

if (failed) process.exit(1)
console.log('\nverify-sync-pull-merge: all ok')
