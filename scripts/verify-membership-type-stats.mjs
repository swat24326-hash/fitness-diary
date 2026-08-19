/**
 * Проверка агрегации статистики по типам абонементов.
 */
import {
  aggregateMembershipTypeStats,
  MEMBERSHIP_TYPE_UNLABELED,
  resolveTrainingMembershipTypeKey,
  buildMembershipStatsIndex,
} from '../api/_lib/membershipTypeStatsAgg.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const memberships = [
  {
    id: 'm1',
    client_id: 'c1',
    membership_type_id: 't12',
    start_date: '2026-04-01',
    end_date: '2026-06-30',
    total_trainings: 12,
    used_trainings: 2,
  },
  {
    id: 'm2',
    client_id: 'c2',
    membership_type_id: null,
    start_date: '2026-04-01',
    end_date: '2026-06-30',
    total_trainings: 8,
    used_trainings: 1,
  },
]

const membershipTypes = [
  { id: 't12', code: '12' },
  { id: 'tDm', code: 'Dm' },
]

const trainings = [
  { id: '1', trainer_id: 'tr1', client_id: 'c1', status: 'completed', date: '2026-05-01', data: { membership_id: 'm1' } },
  {
    id: '2',
    trainer_id: 'tr1',
    client_id: 'c1',
    status: 'completed',
    date: '2026-05-02',
    data: { membership_id: 'm1', is_writeoff: true },
  },
  { id: '3', trainer_id: 'tr1', client_id: 'c1', status: 'draft', date: '2026-05-03', data: { membership_id: 'm1' } },
  { id: '4', trainer_id: 'tr2', client_id: 'c2', status: 'completed', date: '2026-05-04', data: { membership_id: 'm2' } },
  { id: '5', trainer_id: 'tr1', client_id: 'c1', status: 'completed', date: '2026-05-05', data: {} },
]

const club = aggregateMembershipTypeStats({ trainings, memberships, membershipTypes })
ok(club.totalCounted === 4, 'counts completed + writeoff, skips draft')
ok(club.byType.find((x) => x.code === '12')?.count === 3, 'type 12 from m1 + date fallback without membership_id')
ok(club.byType.find((x) => x.code === 'Без типа')?.count === 1, 'unlabeled only when abon has no type')

const tr1 = club.byTrainerByType.find((x) => x.trainerId === 'tr1')
ok(tr1?.total === 3, 'trainer tr1 total')
ok(tr1?.byType.find((x) => x.code === '12')?.count === 3, 'trainer tr1 type 12 incl fallback')

const trainerOnly = aggregateMembershipTypeStats({
  trainings,
  memberships,
  membershipTypes,
  trainerIdFilter: 'tr2',
})
ok(trainerOnly.totalCounted === 1, 'trainer filter')
ok(trainerOnly.byType[0]?.code === 'Без типа', 'trainer tr2 unlabeled when type_id null')

const { membershipById, membershipsByClientId } = buildMembershipStatsIndex(memberships)
ok(
  resolveTrainingMembershipTypeKey(trainings[4], membershipById, membershipsByClientId) === 't12',
  'date fallback resolves type without membership_id',
)
ok(
  resolveTrainingMembershipTypeKey(trainings[4], membershipById, null) === MEMBERSHIP_TYPE_UNLABELED,
  'without client index — still unlabeled',
)

ok(MEMBERSHIP_TYPE_UNLABELED === '__none__', 'unlabeled constant')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll membership-type-stats checks passed.')
