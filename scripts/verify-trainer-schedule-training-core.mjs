/**
 * Связь расписания и тренировки.
 * node scripts/verify-trainer-schedule-training-core.mjs
 */
import {
  buildScheduleWorkoutNewPath,
  resolveScheduleTrainingStart,
  scheduleEntryTrainingStatusLabel,
  shouldLinkScheduleEntryOnTrainingSave,
} from '../src/lib/trainer/trainerScheduleTrainingCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const entry = {
  id: 'sch-1',
  day_date: '2026-08-27',
  client_ids: ['client-1'],
  linked_training_id: null,
}

const startNew = resolveScheduleTrainingStart(entry, { workoutsBase: '/trainer/workouts' })
ok(startNew.kind === 'new', 'single client → new')
ok(startNew.path.includes('clientId=client-1'), 'new path clientId')
ok(startNew.path.includes('scheduleEntry=sch-1'), 'new path scheduleEntry')

const linked = resolveScheduleTrainingStart(
  { ...entry, linked_training_id: 'tr-1' },
  { trainingById: { 'tr-1': { id: 'tr-1', status: 'draft' } } },
)
ok(linked.kind === 'open' && linked.path.endsWith('/tr-1'), 'linked draft → open')

const linkedMissingLocal = resolveScheduleTrainingStart(
  { ...entry, linked_training_id: 'tr-gone' },
  { trainingById: {}, workoutsBase: '/trainer/workouts' },
)
ok(
  linkedMissingLocal.kind === 'open' && linkedMissingLocal.path.endsWith('/tr-gone'),
  'linked id without local row → open (no duplicate new)',
)

const pick = resolveScheduleTrainingStart(
  { ...entry, client_ids: ['c1', 'c2'] },
  { workoutsBase: '/trainer/workouts' },
)
ok(pick.kind === 'pick_client' && pick.clientIds.length === 2, 'multi client → pick')

ok(resolveScheduleTrainingStart({ ...entry, client_ids: [], title: 'Обед' }).kind === 'none', 'note only → none')

ok(shouldLinkScheduleEntryOnTrainingSave('sch-1', 'tr-1'), 'link ids valid')
ok(!shouldLinkScheduleEntryOnTrainingSave('', 'tr-1'), 'link empty schedule')

ok(
  scheduleEntryTrainingStatusLabel(
    { linked_training_id: 'tr-1' },
    { id: 'tr-1', status: 'draft' },
  ) === 'Черновик тренировки',
  'status label draft',
)

const built = buildScheduleWorkoutNewPath('c1', '2026-08-27', 'sch-1')
ok(built.includes('/trainer/workouts/new?'), 'build new path')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-trainer-schedule-training-core: all passed')
