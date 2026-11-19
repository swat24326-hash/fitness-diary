/**
 * Проверка агрегации статистики по типам абонементов.
 * Объём: без БЗ и «Без типа» (личные).
 */
import {
  aggregateMembershipTypeStats,
  MEMBERSHIP_TYPE_UNLABELED,
  resolveTrainingMembershipTypeKey,
  buildMembershipStatsIndex,
  filterTrainingsForVolumeStats,
  filterCompletedTrainingsForVolumeStats,
  membershipTypeKeyCountsInVolumeStats,
  buildMembershipTypeById,
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
  {
    id: 'm3',
    client_id: 'c3',
    membership_type_id: 'tbz',
    start_date: '2026-04-01',
    end_date: '2026-06-30',
    total_trainings: 2,
    used_trainings: 1,
  },
]

const membershipTypes = [
  { id: 't12', code: '12' },
  { id: 'tDm', code: 'Dm' },
  { id: 'tbz', code: 'БЗ', is_pnk_trial: true },
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
  { id: '6', trainer_id: 'tr1', client_id: 'c3', status: 'completed', date: '2026-05-06', data: { membership_id: 'm3' } },
]

const club = aggregateMembershipTypeStats({ trainings, memberships, membershipTypes })
ok(club.totalCounted === 3, 'volume: paid typed only (skips draft, unlabeled, БЗ)')
ok(club.byType.find((x) => x.code === '12')?.count === 3, 'type 12 from m1 + date fallback without membership_id')
ok(!club.byType.find((x) => x.code === 'Без типа'), 'Без типа not in byType')
ok(!club.byType.find((x) => x.code === 'БЗ'), 'БЗ not in byType')

const tr1 = club.byTrainerByType.find((x) => x.trainerId === 'tr1')
ok(tr1?.total === 3, 'trainer tr1 total typed only')
ok(tr1?.byType.find((x) => x.code === '12')?.count === 3, 'trainer tr1 type 12 incl fallback')

const trainerOnly = aggregateMembershipTypeStats({
  trainings,
  memberships,
  membershipTypes,
  trainerIdFilter: 'tr2',
})
ok(trainerOnly.totalCounted === 0, 'trainer tr2 only unlabeled — excluded from volume')
ok((trainerOnly.byType ?? []).length === 0, 'tr2 no type rows')

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

const typeById = buildMembershipTypeById(membershipTypes)
ok(!membershipTypeKeyCountsInVolumeStats(MEMBERSHIP_TYPE_UNLABELED, typeById), 'unlabeled out of volume')
ok(!membershipTypeKeyCountsInVolumeStats('tbz', typeById), 'БЗ out of volume')
ok(membershipTypeKeyCountsInVolumeStats('t12', typeById), 'paid type in volume')

const volume = filterTrainingsForVolumeStats(trainings, memberships, membershipTypes)
ok(volume.filter((t) => t.status === 'completed').length === 3, 'volume filter completed = 3')
ok(volume.some((t) => t.status === 'draft'), 'volume keeps typed draft')
ok(filterCompletedTrainingsForVolumeStats(trainings, memberships, membershipTypes).length === 3, 'completed-only volume')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll membership-type-stats checks passed.')
