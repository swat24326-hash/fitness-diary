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
import {
  isMissingTrainingsUpdatedAtError,
  prepareTrainingPushPayload,
  stripTrainingUpdatedAt,
} from '../api/_lib/normalizeTrainingPayload.js'
import { stampTrainingUpdatedAt } from '../src/lib/trainingUpdatedAtCore.js'

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

console.log('\n--- Сценарий B3: completed без updated_at (старый прод) — ничья по created_at ---')
ok(
  shouldApplyCloudRowOnPull({
    localRow: {
      id: 't-old',
      synced: true,
      status: 'completed',
      created_at: '2026-08-01T10:00:00.000Z',
      data: { exercises: [] },
    },
    cloudRow: {
      id: 't-old',
      synced: true,
      status: 'completed',
      created_at: '2026-08-01T10:00:00.000Z',
      data: { exercises: [{ id: 'e1' }] },
    },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-old',
  }),
  'B3a equal created_at: cloud applies (tie)',
)

console.log('\n--- Сценарий B4: prepareTrainingPushPayload + stamp ---')
const prepared = prepareTrainingPushPayload(
  {
    id: 't3',
    client_id: 'c1',
    trainer_id: 'tr1',
    club_id: 'cl1',
    date: '2026-08-22',
    type: 'Силовая',
    status: 'completed',
    data: { exercises: [] },
    created_at: '2026-08-20T10:00:00.000Z',
    synced: false,
    junk: 'drop-me',
  },
  { operation: 'update', nowIso: '2026-08-22T15:00:00.000Z' },
)
ok(prepared?.updated_at === '2026-08-22T15:00:00.000Z', 'B4a push payload stamps updated_at')
ok(prepared?.created_at === undefined, 'B4b update omits created_at')
ok(prepared?.junk === undefined, 'B4c allowlist drops junk')
ok(prepared?.synced === undefined, 'B4d local synced not pushed')
ok(
  stripTrainingUpdatedAt(prepared)?.updated_at === undefined,
  'B4e strip for pre-migration retry',
)
ok(
  isMissingTrainingsUpdatedAtError('Could not find the \'updated_at\' column of \'trainings\' in the schema cache'),
  'B4f detect missing column error',
)
const stamped = stampTrainingUpdatedAt({ id: 't4', status: 'completed' }, '2026-08-22T16:00:00.000Z')
ok(stamped.updated_at === '2026-08-22T16:00:00.000Z', 'B4g local stamp')

console.log('\n--- Сценарий B5: post-push — локаль новее ответа сервера (правка в полёте) ---')
ok(
  rowRevisionMs({ updated_at: '2026-08-22T16:01:00.000Z' }) >
    rowRevisionMs({ updated_at: '2026-08-22T16:00:00.000Z' }),
  'B5 local revision wins over stale push response',
)

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

console.log('\n--- Сценарий F: нестандартные и критические ---')
ok(
  !shouldApplyCloudRowOnPull({
    localRow: {
      id: 't-f1',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      data: { note: 'done' },
    },
    cloudRow: {
      id: 't-f1',
      synced: true,
      status: 'draft',
      updated_at: '2026-08-22T13:00:00.000Z',
      data: { note: 'stale-draft' },
    },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f1',
  }),
  'F1 CRITICAL: cloud draft never un-completes local completed',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: {
      id: 't-f2',
      synced: false,
      status: 'completed',
      updated_at: '2026-08-22T14:00:00.000Z',
    },
    cloudRow: {
      id: 't-f2',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T15:00:00.000Z',
    },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f2',
  }),
  'F2 completed ещё в очереди (synced:false) — cloud не затирает',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: {
      id: 't-f3',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T16:00:00.000Z',
    },
    cloudRow: {
      id: 't-f3',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T15:00:00.000Z',
    },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f3',
  }),
  'F3 локаль новее completed — stale cloud skipped',
)
ok(
  shouldApplyCloudRowOnPull({
    localRow: {
      id: 't-f4',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T10:00:00.000Z',
    },
    cloudRow: {
      id: 't-f4',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T10:00:00.000Z',
      data: { note: 'same-ts' },
    },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f4',
  }),
  'F4 equal updated_at — cloud applies (tie → cloud)',
)
ok(
  shouldApplyCloudRowOnPull({
    localRow: {
      id: 't-f5',
      synced: true,
      status: 'completed',
      created_at: '2026-08-01T10:00:00.000Z',
    },
    cloudRow: {
      id: 't-f5',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      created_at: '2026-08-01T10:00:00.000Z',
    },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f5',
  }),
  'F5 локаль только created_at, облако с updated_at — cloud applies',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: {
      id: 't-f6',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T18:00:00.000Z',
      created_at: '2026-08-01T10:00:00.000Z',
    },
    cloudRow: {
      id: 't-f6',
      synced: true,
      status: 'completed',
      created_at: '2026-08-01T10:00:00.000Z',
    },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f6',
  }),
  'F6 облако без updated_at (старый снимок) — не затирает локаль с меткой',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: {
      id: 't-f7',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T11:00:00.000Z',
    },
    cloudRow: {
      id: 't-f7',
      synced: true,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
    },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set(['t-f7']) },
    recordKey: 't-f7',
  }),
  'F7 pending в очереди блокирует даже более новый cloud',
)
ok(
  shouldApplyCloudRowOnPull({
    localRow: null,
    cloudRow: { id: 't-f8', status: 'completed', updated_at: '2026-08-22T12:00:00.000Z' },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f8',
  }),
  'F8 нет локальной строки — cloud inserts',
)
ok(
  shouldApplyCloudRowOnPull({
    localRow: { id: 't-f9', synced: true, status: 'draft', updated_at: '2026-08-22T10:00:00.000Z' },
    cloudRow: { id: 't-f9', synced: true, status: 'completed', updated_at: '2026-08-22T12:00:00.000Z' },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f9',
  }),
  'F9 synced draft ← cloud completed (другой девайс завершил)',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: { id: 't-f9b', synced: true, status: 'draft', updated_at: '2026-08-22T14:00:00.000Z' },
    cloudRow: { id: 't-f9b', synced: true, status: 'completed', updated_at: '2026-08-22T12:00:00.000Z' },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f9b',
  }),
  'F9b synced draft новее completed — не откатываем',
)
ok(
  !shouldApplyCloudRowOnPull({
    localRow: { id: 't-f9c', synced: true, status: 'draft', updated_at: '2026-08-22T10:00:00.000Z' },
    cloudRow: { id: 't-f9c', synced: true, status: 'draft', data: { exercises: [] } },
    storeName: 'trainings',
    pendingByStore: { trainings: new Set() },
    recordKey: 't-f9c',
  }),
  'F9c synced draft ← cloud draft empty — preserve local',
)
ok(rowRevisionMs({ updated_at: 'not-a-date', created_at: '2026-08-22T10:00:00.000Z' }) > 0, 'F10 bad updated_at → fallback created_at')
ok(rowRevisionMs({ updated_at: '', created_at: '' }) === 0, 'F11 empty dates → 0')
ok(rowRevisionMs(null) === 0, 'F12 null row → 0')

const srcF13 = { id: 't-f13', status: 'completed' }
const stampedF13 = stampTrainingUpdatedAt(srcF13, '2026-08-22T20:00:00.000Z')
ok(srcF13.updated_at === undefined, 'F13 stamp does not mutate source')
ok(stampedF13.updated_at === '2026-08-22T20:00:00.000Z', 'F13b stamp sets field')

const prepIns = prepareTrainingPushPayload(
  {
    id: 't-f14',
    client_id: 'c',
    trainer_id: 'tr',
    club_id: 'cl',
    date: '2026-08-22',
    type: 'Силовая',
    status: 'completed',
    data: {},
    created_at: '2026-08-20T10:00:00.000Z',
  },
  { operation: 'insert', nowIso: '2026-08-22T21:00:00.000Z' },
)
ok(prepIns?.created_at === '2026-08-20T10:00:00.000Z', 'F14 insert keeps created_at')
ok(prepIns?.updated_at === '2026-08-22T21:00:00.000Z', 'F14b insert stamps updated_at')

const prepSpisanie = prepareTrainingPushPayload(
  { type: 'Списание', status: 'completed', data: {}, date: '2026-08-22', client_id: 'c', trainer_id: 't', club_id: 'cl', id: 'x' },
  { operation: 'update', nowIso: '2026-08-22T22:00:00.000Z' },
)
ok(prepSpisanie?.type === 'Силовая' && prepSpisanie?.data?.is_writeoff === true, 'F15 списание → type Силовая + is_writeoff')

ok(
  isMissingTrainingsUpdatedAtError("Could not find the 'updated_at' column of 'trainings' in the schema cache"),
  'F16 missing column detect',
)
ok(stripTrainingUpdatedAt({ id: '1', updated_at: 'x' })?.updated_at === undefined, 'F17 strip updated_at')

ok(
  !shouldApplyCloudRowOnPull({
    localRow: { id: 't-f18', synced: true, status: 'completed', updated_at: '2026-08-22T12:00:00.000Z' },
    cloudRow: null,
    storeName: 'trainings',
    recordKey: 't-f18',
  }),
  'F18 null cloud → no apply',
)

const pruneMixed = trainingIdsToPruneForClient(
  'c9',
  [
    { id: 'keep-remote', client_id: 'c9', status: 'completed' },
    { id: 'ghost-done', client_id: 'c9', status: 'completed' },
    { id: 'open-draft', client_id: 'c9', status: 'draft' },
    { id: 'unsynced-done', client_id: 'c9', status: 'completed', synced: false },
  ],
  [{ id: 'keep-remote', client_id: 'c9' }],
  new Set(['unsynced-done']),
)
ok(pruneMixed.includes('ghost-done'), 'F19 prune ghost completed')
ok(!pruneMixed.includes('open-draft'), 'F19b never prune draft')
ok(!pruneMixed.includes('unsynced-done'), 'F19c never prune pending completed')
ok(!pruneMixed.includes('keep-remote'), 'F19d keep remote row')

if (failed) process.exit(1)
console.log('\nverify-sync-pull-merge: all ok')
