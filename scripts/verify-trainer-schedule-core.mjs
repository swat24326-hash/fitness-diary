/**
 * Расписание тренера — чистые правила.
 * node scripts/verify-trainer-schedule-core.mjs
 */
import {
  buildScheduleEntryLabel,
  buildScheduleMonthGrid,
  buildTrainerScheduleClientPickerList,
  clientMatchesTrainerScheduleSearch,
  countScheduleEntriesByDay,
  assignScheduleEntryLanes,
  filterScheduleEntriesForDay,
  formatScheduleMinutes,
  normalizeScheduleClientIds,
  normalizeTrainerScheduleEntry,
  parseScheduleTimeToMinutes,
  planTrainerSchedulePrune,
  resolveTrainerSchedulePullWindow,
  shouldReloadTrainerScheduleData,
} from '../src/lib/trainer/trainerScheduleCore.js'
import { normalizeTrainerPullPayload } from '../src/lib/trainerPullResponseCore.js'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { PULL_MERGE_GUARD_STORE_LIST } from '../src/lib/syncPullGuardCore.js'
import { SYNC_TABLE_PRIORITY, splitSyncPushWaves, syncQueueSortKey } from '../src/lib/syncQueuePriorityCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

ok(parseScheduleTimeToMinutes('10:30') === 630, 'parse 10:30')
ok(formatScheduleMinutes(630) === '10:30', 'format 10:30')
ok(normalizeScheduleClientIds(['a', 'a', 'b']).join(',') === 'a,b', 'dedupe client ids')

const row = normalizeTrainerScheduleEntry({
  id: '11111111-1111-4111-8111-111111111111',
  club_id: '22222222-2222-4222-8222-222222222222',
  trainer_id: '33333333-3333-4333-8333-333333333333',
  day_date: '2026-08-27',
  start_minutes: 600,
  duration_minutes: 60,
  title: '',
  client_ids: ['44444444-4444-4444-8444-444444444444'],
})
ok(Boolean(row?.id), 'normalize with client')

const note = normalizeTrainerScheduleEntry({
  id: '11111111-1111-4111-8111-111111111111',
  club_id: '22222222-2222-4222-8222-222222222222',
  trainer_id: '33333333-3333-4333-8333-333333333333',
  day_date: '2026-08-27',
  start_minutes: 720,
  duration_minutes: 30,
  title: 'Обед',
  client_ids: [],
})
ok(note?.title === 'Обед', 'normalize note')

const grid = buildScheduleMonthGrid(2026, 8)
ok(grid.weeks.length >= 4 && grid.weeks[0].length === 7, 'month grid shape')
ok(grid.weeks.flat().some((c) => c?.iso === '2026-08-27'), 'aug 27 in grid')

const entries = [
  { id: 'e1', day_date: '2026-08-27', start_minutes: 600, trainer_id: 't1' },
  { id: 'e2', day_date: '2026-08-28', start_minutes: 540, trainer_id: 't1' },
]
ok(filterScheduleEntriesForDay(entries, '2026-08-27').length === 1, 'filter day')
ok(countScheduleEntriesByDay(entries, 2026, 8)['2026-08-27'] === 1, 'count by day')

const laneSolo = assignScheduleEntryLanes([
  { id: 'a', start_minutes: 900, duration_minutes: 60 },
])
ok(laneSolo.get('a')?.lane === 0 && laneSolo.get('a')?.laneCount === 1, 'lane solo')

const laneOverlap = assignScheduleEntryLanes([
  { id: 'a', start_minutes: 900, duration_minutes: 60 },
  { id: 'b', start_minutes: 900, duration_minutes: 60 },
  { id: 'c', start_minutes: 960, duration_minutes: 60 },
])
ok(laneOverlap.get('a')?.lane !== laneOverlap.get('b')?.lane, 'overlap different lanes')
ok(laneOverlap.get('a')?.laneCount === 2 && laneOverlap.get('b')?.laneCount === 2, 'overlap cluster width 2')
ok(laneOverlap.get('c')?.laneCount === 1, 'non-overlap alone')

ok(
  buildScheduleEntryLabel({ client_ids: ['c1'], title: '' }, { c1: 'Иванов' }) === 'Иванов',
  'label single client',
)
ok(buildScheduleEntryLabel({ client_ids: [], title: 'Созвон' }) === 'Созвон', 'label note')

const win = resolveTrainerSchedulePullWindow('2026-08-27')
ok(win.dayFrom === '2026-07-28' && win.dayTo === '2026-12-25', 'pull window 30/120')

const prune = planTrainerSchedulePrune(
  [
    { id: 'local-1', trainer_id: 't1', day_date: '2026-08-27' },
    { id: 'local-2', trainer_id: 't1', day_date: '2026-08-27' },
  ],
  [{ id: 'local-2', trainer_id: 't1', day_date: '2026-08-27' }],
  't1',
  new Set(['local-pending']),
  { dayFrom: '2026-08-01', dayTo: '2026-08-31' },
)
ok(prune.includes('local-1') && !prune.includes('local-2'), 'prune orphan in window')

const pull = normalizeTrainerPullPayload({ trainer_schedule_entries: [{ id: 's1' }] })
ok(Array.isArray(pull?.trainer_schedule_entries) && pull.trainer_schedule_entries.length === 1, 'pull payload field')

ok(PUSH_ALLOWED_TABLES.has('trainer_schedule_entries'), 'push allowlist')
ok(PULL_MERGE_GUARD_STORE_LIST.includes('trainer_schedule_entries'), 'pull guard')

const sampleClients = [
  { id: 'c1', name: 'Лихацкая Юлия', phone: '79001234567', card_number: '1001' },
  { id: 'c2', name: 'Семенов Д.А.', phone: '79998887766', card_number: '2002' },
]
ok(clientMatchesTrainerScheduleSearch(sampleClients[0], 'лихац'), 'search by name')
ok(clientMatchesTrainerScheduleSearch(sampleClients[0], '4567'), 'search by phone')
ok(clientMatchesTrainerScheduleSearch(sampleClients[1], '2002'), 'search by card')
ok(!clientMatchesTrainerScheduleSearch(sampleClients[1], 'лихац'), 'search no false positive')

const picked = buildTrainerScheduleClientPickerList(sampleClients, 'семен', ['c1'])
ok(picked.length === 2 && picked[0].id === 'c1' && picked[1].id === 'c2', 'picker keeps selected + matches')

ok(!shouldReloadTrainerScheduleData({ reason: 'sync-queue' }), 'schedule reload: skip sync-queue')
ok(shouldReloadTrainerScheduleData({ reason: 'sync-complete' }), 'schedule reload: sync-complete')
ok(shouldReloadTrainerScheduleData({ reason: 'trainer-schedule' }), 'schedule reload: trainer-schedule')
ok(shouldReloadTrainerScheduleData({}), 'schedule reload: pull empty reason')
ok(!shouldReloadTrainerScheduleData({ reason: 'exercises' }), 'schedule reload: skip exercises')

ok(SYNC_TABLE_PRIORITY.trainings < SYNC_TABLE_PRIORITY.trainer_schedule_entries, 'trainings before schedule priority')
ok(
  syncQueueSortKey({ table_name: 'trainings', operation: 'insert' }) <
    syncQueueSortKey({ table_name: 'trainer_schedule_entries', operation: 'update' }),
  'insert training before schedule update',
)
{
  const waves = splitSyncPushWaves([
    { table_name: 'trainer_schedule_entries', operation: 'update', data: { id: 's1' } },
    { table_name: 'trainings', operation: 'insert', data: { id: 't1' } },
  ])
  ok(waves.length === 2 && waves[0][0].table_name === 'trainings', 'push waves: trainings first')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-trainer-schedule-core: all passed')
