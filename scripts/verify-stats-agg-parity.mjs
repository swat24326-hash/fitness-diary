/**
 * Паритет агрегаций: api/_lib/*Agg.js vs src/lib/admin/*Agg.js
 * Ловит расхождение формул между сервером и офлайн-статистикой.
 */
import { aggregateClubClientPeriod as aggApiClub } from '../api/_lib/clubStatsAgg.js'
import { aggregateClubClientPeriod as aggSrcClub } from '../src/lib/admin/clubClientPeriodAgg.js'
import { aggregateMembershipTypeStats as aggApiType } from '../api/_lib/membershipTypeStatsAgg.js'
import { aggregateMembershipTypeStats as aggSrcType } from '../src/lib/admin/membershipTypeStatsAgg.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

function stableJson(v) {
  return JSON.stringify(v, (_k, val) => (val === undefined ? null : val))
}

function assertParity(label, apiOut, srcOut) {
  const a = stableJson(apiOut)
  const s = stableJson(srcOut)
  if (a === s) {
    console.log(`ok: parity ${label}`)
    return
  }
  console.error(`FAIL: parity ${label}`)
  console.error('  api:', a.slice(0, 500))
  console.error('  src:', s.slice(0, 500))
  failed++
}

const clients = [
  { id: 'c1', name: 'Иванов' },
  { id: 'c2', name: 'Петров' },
  { id: 'c3', name: 'Сидоров' },
  { id: 'c4', name: 'Лазутко' },
]

const memberships = [
  { client_id: 'c1', start_date: '2026-05-01', end_date: '2026-05-15', total_trainings: 12, used_trainings: 12 },
  { client_id: 'c2', start_date: '2026-05-01', end_date: '2026-06-15', total_trainings: 12, used_trainings: 3 },
  { client_id: 'c3', start_date: '2026-06-01', end_date: '2026-06-30', total_trainings: 12, used_trainings: 0 },
  { client_id: 'c4', start_date: '2026-05-01', end_date: '2026-06-30', total_trainings: 12, used_trainings: 12 },
]

const dateFrom = '2026-05-01'
const dateTo = '2026-05-31'
const asOf = '2026-05-31'

assertParity(
  'aggregateClubClientPeriod',
  aggApiClub(clients, memberships, dateFrom, dateTo, asOf),
  aggSrcClub(clients, memberships, dateFrom, dateTo, asOf),
)

const juneClient = [{ id: 'maria', name: 'Шах' }]
const juneMem = [{ client_id: 'maria', start_date: '2026-05-29', end_date: '2026-06-29', total_trainings: 8, used_trainings: 2 }]
assertParity(
  'aggregateClubClientPeriod june 29 end',
  aggApiClub(juneClient, juneMem, '2026-06-01', '2026-06-30', '2026-06-30'),
  aggSrcClub(juneClient, juneMem, '2026-06-01', '2026-06-30', '2026-06-30'),
)

const withArchived = [...clients, { id: 'c5', name: 'Архив', archived_at: '2026-06-01' }]
assertParity(
  'aggregateClubClientPeriod excludes archived',
  aggApiClub(withArchived, memberships, dateFrom, dateTo, asOf),
  aggSrcClub(withArchived, memberships, dateFrom, dateTo, asOf),
)

const membershipRows = [
  { id: 'm1', membership_type_id: 't12' },
  { id: 'm2', membership_type_id: null },
]
const membershipTypes = [
  { id: 't12', code: '12' },
  { id: 'tDm', code: 'Dm' },
]
const trainings = [
  { id: '1', trainer_id: 'tr1', status: 'completed', date: '2026-05-01', data: { membership_id: 'm1' } },
  { id: '2', trainer_id: 'tr1', status: 'completed', date: '2026-05-02', data: { membership_id: 'm1', is_writeoff: true } },
  { id: '3', trainer_id: 'tr1', status: 'draft', date: '2026-05-03', data: { membership_id: 'm1' } },
  { id: '4', trainer_id: 'tr2', status: 'completed', date: '2026-05-04', data: { membership_id: 'm2' } },
]

const typeInput = { trainings, memberships: membershipRows, membershipTypes }
assertParity('aggregateMembershipTypeStats', aggApiType(typeInput), aggSrcType(typeInput))

ok(failed === 0, 'no failures')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll stats-agg-parity checks passed.')
