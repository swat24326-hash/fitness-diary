/**
 * Push auth ежедневника — чистые правила.
 * node scripts/verify-trainer-schedule-push-auth.mjs
 */
import {
  assertTrainerScheduleLinkedTraining,
  assertTrainerSchedulePushOwnership,
  canRolePushTrainerSchedule,
  filterScheduleEntriesByClubId,
  filterScheduleEntriesForClubTrainers,
} from '../src/lib/trainer/trainerSchedulePushAuthCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

ok(canRolePushTrainerSchedule({ isTrainer: true }), 'trainer can push')
ok(!canRolePushTrainerSchedule({ isTrainer: false }), 'non-trainer denied')
ok(!canRolePushTrainerSchedule({ isTrainer: false, isAdmin: true }), 'admin alone denied')

const uid = '33333333-3333-4333-8333-333333333333'
const club = '22222222-2222-4222-8222-222222222222'

const ownInsert = assertTrainerSchedulePushOwnership(uid, club, 'insert', {
  trainer_id: uid,
  club_id: club,
}, null)
ok(ownInsert.ok, 'own insert ok')

const foreignTrainer = assertTrainerSchedulePushOwnership(uid, club, 'insert', {
  trainer_id: '99999999-9999-4999-8999-999999999999',
  club_id: club,
}, null)
ok(!foreignTrainer.ok, 'foreign trainer_id rejected')

const foreignClub = assertTrainerSchedulePushOwnership(uid, club, 'insert', {
  trainer_id: uid,
  club_id: '99999999-9999-4999-8999-999999999999',
}, null)
ok(!foreignClub.ok, 'foreign club rejected')

const noClub = assertTrainerSchedulePushOwnership(uid, '', 'insert', {
  trainer_id: uid,
  club_id: club,
}, null)
ok(!noClub.ok, 'empty profile club rejected')

const updateOther = assertTrainerSchedulePushOwnership(uid, club, 'update', {
  trainer_id: uid,
  club_id: club,
}, { trainer_id: 'other', club_id: club })
ok(!updateOther.ok, 'update other trainer row rejected')

const linkOk = assertTrainerScheduleLinkedTraining(
  { id: 't1', trainer_id: uid, club_id: club },
  uid,
  club,
)
ok(linkOk.ok, 'linked training own')

const linkForeign = assertTrainerScheduleLinkedTraining(
  { id: 't1', trainer_id: 'other', club_id: club },
  uid,
  club,
)
ok(!linkForeign.ok, 'linked training other trainer rejected')

const entries = [
  { id: '1', club_id: club, trainer_id: uid },
  { id: '2', club_id: club, trainer_id: 'bad' },
  { id: '3', club_id: 'other-club', trainer_id: uid },
]
const filtered = filterScheduleEntriesForClubTrainers(
  filterScheduleEntriesByClubId(entries, club),
  new Set([uid]),
)
ok(filtered.length === 1 && filtered[0].id === '1', 'admin entries filtered by club+trainer')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer-schedule-push-auth checks passed.')
