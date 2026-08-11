/**
 * Verify club stats hall filter + client period by hall.
 * node scripts/verify-club-stats-hall.mjs
 */
import {
  aggregateHallMembershipTypeCensus,
  clientMatchesClubStatsHall,
  filterTrainingsByClubStatsHall,
  normalizeClubStatsHall,
  sliceClubStatsByHall,
} from '../src/lib/admin/clubStatsHallFilterCore.js'
import { aggregateClubClientPeriod as aggClient } from '../src/lib/admin/clubClientPeriodAgg.js'
import { aggregateClubClientPeriod as aggApi } from '../api/_lib/clubStatsAgg.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeClubStatsHall('ТЗ') === 'tz', 'normalize ТЗ')
ok(normalizeClubStatsHall('pz') === 'pz', 'normalize pz')

const clients = [
  { id: 'p1', name: 'ПЗ', trainer_id: 't1', lifecycle: 'active' },
  { id: 'tz1', name: 'ТЗ desk', trainer_id: null, desk_hall: 'tz', lifecycle: 'active' },
  { id: 'az1', name: 'АЗ desk', trainer_id: null, desk_hall: 'az', lifecycle: 'active' },
  { id: 'multi', name: 'Мульти', trainer_id: 't1', lifecycle: 'active' },
  { id: 'arch', name: 'Архив', trainer_id: 't1', archived_at: '2026-01-01', lifecycle: 'active' },
  // Есть тренер ПЗ, но абоны только ТЗ — не должен попадать в census ПЗ
  { id: 'tz-only', name: 'Только ТЗ+тренер', trainer_id: 't1', lifecycle: 'active' },
  // Legacy ПЗ: тренер, без абонов
  { id: 'legacy', name: 'Legacy ПЗ', trainer_id: 't1', lifecycle: 'active' },
]

const memberships = [
  {
    id: 'm-p1',
    client_id: 'p1',
    hall: 'pz',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    total_trainings: 8,
    used_trainings: 1,
    membership_type_id: 'tp',
  },
  {
    id: 'm-tz1',
    client_id: 'tz1',
    hall: 'tz',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    total_trainings: 0,
    used_trainings: 0,
    membership_type_id: 'tt',
  },
  {
    id: 'm-az1',
    client_id: 'az1',
    hall: 'az',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    total_trainings: 10,
    used_trainings: 2,
    membership_type_id: 'ta',
  },
  {
    id: 'm-multi-pz',
    client_id: 'multi',
    hall: 'pz',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    total_trainings: 8,
    used_trainings: 0,
    membership_type_id: 'tp',
  },
  {
    id: 'm-multi-tz',
    client_id: 'multi',
    hall: 'tz',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    total_trainings: 0,
    used_trainings: 0,
    membership_type_id: 'tt',
  },
  {
    id: 'm-tz-only',
    client_id: 'tz-only',
    hall: 'tz',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    total_trainings: 0,
    used_trainings: 0,
    membership_type_id: 'tt',
  },
]

const byId = Object.fromEntries(clients.map((c) => [c.id, c]))
const memsOf = (id) => memberships.filter((m) => m.client_id === id)

ok(clientMatchesClubStatsHall(byId.p1, 'pz', memsOf('p1')), 'p1 in pz')
ok(!clientMatchesClubStatsHall(byId.tz1, 'pz', memsOf('tz1')), 'tz desk not in pz')
ok(clientMatchesClubStatsHall(byId.tz1, 'tz', memsOf('tz1')), 'tz desk in tz')
ok(clientMatchesClubStatsHall(byId.multi, 'pz', memsOf('multi')), 'multi in pz')
ok(clientMatchesClubStatsHall(byId.multi, 'tz', memsOf('multi')), 'multi in tz')
ok(!clientMatchesClubStatsHall(byId.arch, 'pz', memsOf('arch')), 'archived out')
ok(!clientMatchesClubStatsHall(byId['tz-only'], 'pz', memsOf('tz-only')), 'trainer+only-tz not in pz')
ok(clientMatchesClubStatsHall(byId['tz-only'], 'tz', memsOf('tz-only')), 'trainer+only-tz in tz')
ok(clientMatchesClubStatsHall(byId.legacy, 'pz', memsOf('legacy')), 'legacy trainer no-mem in pz')
ok(!clientMatchesClubStatsHall(byId.legacy, 'tz', memsOf('legacy')), 'legacy not in tz')

const sliceTz = sliceClubStatsByHall(clients, memberships, 'tz')
ok(sliceTz.clients.length === 3, `tz clients = 3 (got ${sliceTz.clients.length})`)
ok(sliceTz.memberships.every((m) => m.hall === 'tz'), 'tz memberships only')

// ID как число vs строка — не терять срез
const clientsNumId = [{ id: 42, name: 'Num', trainer_id: 't1', lifecycle: 'active' }]
const memsNumId = [
  {
    id: 'm42',
    client_id: 42,
    hall: 'pz',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    total_trainings: 4,
    used_trainings: 0,
    membership_type_id: 'tp',
  },
]
const sliceNum = sliceClubStatsByHall(clientsNumId, memsNumId, 'pz')
ok(sliceNum.clients.length === 1 && sliceNum.memberships.length === 1, 'string/number id slice')

const pz = aggClient(clients, memberships, '2026-08-01', '2026-08-31', '2026-08-15', { hall: 'pz' })
const tz = aggClient(clients, memberships, '2026-08-01', '2026-08-31', '2026-08-15', { hall: 'tz' })
const az = aggClient(clients, memberships, '2026-08-01', '2026-08-31', '2026-08-15', { hall: 'az' })
ok(pz.totalClients === 3, `pz total 3 (p1+multi+legacy, got ${pz.totalClients})`)
ok(tz.totalClients === 3, `tz total 3 (got ${tz.totalClients})`)
ok(az.totalClients === 1, `az total 1 (got ${az.totalClients})`)
ok(pz.activeWithMembership === 2, `pz active 2 (legacy без абона, got ${pz.activeWithMembership})`)
ok(tz.activeWithMembership === 3, 'tz active')

const pzApi = aggApi(clients, memberships, '2026-08-01', '2026-08-31', '2026-08-15', { hall: 'pz' })
ok(pzApi.totalClients === pz.totalClients, 'src/api client period parity')

const trainings = [
  { id: 'tr1', status: 'completed', date: '2026-08-10', client_id: 'p1', trainer_id: 't1', data: { membership_id: 'm-p1' } },
  { id: 'tr2', status: 'completed', date: '2026-08-11', client_id: 'tz1', trainer_id: 't1', data: { membership_id: 'm-tz1' } },
  { id: 'tr3', status: 'completed', date: '2026-08-12', client_id: 'p1', trainer_id: 't1', data: {} },
]
const pzTr = filterTrainingsByClubStatsHall(trainings, memberships, clients, 'pz')
const tzTr = filterTrainingsByClubStatsHall(trainings, memberships, clients, 'tz')
ok(pzTr.length === 2, `pz trainings 2 (got ${pzTr.length})`)
ok(tzTr.length === 1, `tz trainings 1 (got ${tzTr.length})`)

const census = aggregateHallMembershipTypeCensus({
  memberships: sliceTz.memberships,
  membershipTypes: [
    { id: 'tt', code: 'ТЗ-месяц' },
    { id: 'tp', code: 'ПЗ' },
  ],
})
ok(census.totalCounted === 3, `tz type census 3 (got ${census.totalCounted})`)
ok(census.byType.some((r) => r.code === 'ТЗ-месяц' && r.count === 3), 'tz type row')
ok(census.byTrainerByType.length === 0, 'desk census no trainer matrix')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll club stats hall checks passed')
