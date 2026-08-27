/**
 * Ежедневники тренеров — доступ admin/supervisor.
 * node scripts/verify-trainer-schedule-admin-core.mjs
 */
import {
  buildScheduleClientNameById,
  buildTrainerNameById,
  collectScheduleClientIds,
  collectScheduleLinkedTrainingIds,
  collectScheduleTrainerIds,
  resolveScheduleMonthWindow,
  resolveTrainerScheduleAdminClubId,
  validateTrainerScheduleDateRange,
} from '../src/lib/admin/trainerScheduleAdminCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const adminClub = resolveTrainerScheduleAdminClubId({
  isAdmin: true,
  requestedClubId: '22222222-2222-4222-8222-222222222222',
})
ok(adminClub.ok && adminClub.clubId.includes('2222'), 'admin with club_id')

const adminNoClub = resolveTrainerScheduleAdminClubId({ isAdmin: true, requestedClubId: '' })
ok(!adminNoClub.ok, 'admin without club_id rejected')

const supOk = resolveTrainerScheduleAdminClubId({
  isSupervisor: true,
  profileClub: '11111111-1111-4111-8111-111111111111',
  requestedClubId: '11111111-1111-4111-8111-111111111111',
})
ok(supOk.ok && supOk.clubId.startsWith('1111'), 'supervisor own club')

const supDeny = resolveTrainerScheduleAdminClubId({
  isSupervisor: true,
  profileClub: '11111111-1111-4111-8111-111111111111',
  requestedClubId: '99999999-9999-4999-8999-999999999999',
})
ok(!supDeny.ok && supDeny.status === 403, 'supervisor foreign club denied')

const month = resolveScheduleMonthWindow(2026, 8)
ok(month?.dayFrom === '2026-08-01' && month?.dayTo === '2026-08-31', 'august window')

const range = validateTrainerScheduleDateRange('2026-08-01', '2026-08-31')
ok(range.ok, 'valid date range')

const badRange = validateTrainerScheduleDateRange('2026-08-31', '2026-08-01')
ok(!badRange.ok, 'inverted range rejected')

const entries = [
  {
    trainer_id: 't1',
    client_ids: ['c1', 'c2'],
    linked_training_id: 'tr1',
  },
  {
    trainer_id: 't2',
    client_ids: '["c2"]',
    linked_training_id: null,
  },
]
ok(collectScheduleTrainerIds(entries).length === 2, 'collect trainer ids')
ok(collectScheduleClientIds(entries).length === 2, 'collect client ids deduped')
ok(collectScheduleLinkedTrainingIds(entries).join(',') === 'tr1', 'collect linked training')

const names = buildTrainerNameById([{ id: 't1', name: 'Иван' }])
ok(names.t1 === 'Иван', 'trainer name map')

const cnames = buildScheduleClientNameById([{ id: 'c1', name: 'Анна' }])
ok(cnames.c1 === 'Анна', 'client name map')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer-schedule-admin checks passed.')
