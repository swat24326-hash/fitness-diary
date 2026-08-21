/**
 * node scripts/verify-admin-clients-archive-hall.mjs
 */
import {
  ARCHIVE_HALL_FILTER_ALL,
  ARCHIVE_HALL_FILTER_AZ,
  ARCHIVE_HALL_FILTER_PZ,
  ARCHIVE_HALL_FILTER_TZ,
  archiveClientHall,
  buildArchiveHallFilterOptions,
  clientMatchesArchiveHallFilter,
  countArchivedClientsByHall,
  filterArchivedClientsByHall,
  normalizeArchiveHallFilter,
} from '../src/lib/admin/adminClientsArchiveHallCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeArchiveHallFilter('') === ARCHIVE_HALL_FILTER_ALL, 'all empty')
ok(normalizeArchiveHallFilter('все') === ARCHIVE_HALL_FILTER_ALL, 'all ru')
ok(normalizeArchiveHallFilter('ПЗ') === ARCHIVE_HALL_FILTER_PZ, 'pz')
ok(normalizeArchiveHallFilter('tz') === ARCHIVE_HALL_FILTER_TZ, 'tz')
ok(normalizeArchiveHallFilter('аз') === ARCHIVE_HALL_FILTER_AZ, 'az')
ok(normalizeArchiveHallFilter('x') === ARCHIVE_HALL_FILTER_ALL, 'unknown → all')

ok(archiveClientHall({ desk_hall: null }) === 'pz', 'live-like pz')
ok(archiveClientHall({ desk_hall: 'tz' }) === 'tz', 'tz')
ok(archiveClientHall({ desk_hall: 'az' }) === 'az', 'az')
ok(
  archiveClientHall({ id: 'm', desk_hall: null }, [
    { id: '1', client_id: 'm', hall: 'az', start_date: '2020-01-01', end_date: '2020-02-01' },
  ]) === 'az',
  'archive az from membership without desk_hall',
)
ok(
  archiveClientHall({ id: 'm2', desk_hall: null }, [
    { id: '1', client_id: 'm2', hall: 'tz', start_date: '2020-01-01', end_date: '2020-02-01' },
    { id: '2', client_id: 'm2', hall: 'az', start_date: '2020-01-01', end_date: '2020-02-01' },
  ]) === 'tz',
  'multi-hall primary tz over az',
)

const clients = [
  { id: '1', name: 'A', desk_hall: null, archived_at: '2026-01-01' },
  { id: '2', name: 'B', desk_hall: 'tz', archived_at: '2026-01-02' },
  { id: '3', name: 'C', desk_hall: 'az', archived_at: '2026-01-03' },
  { id: '4', name: 'D', desk_hall: null }, // active PZ — not in archive
  { id: '5', name: 'E', desk_hall: 'tz' }, // active TZ
  { id: '6', name: 'F', desk_hall: null, archived_at: '2026-01-04' }, // archive via AZ mem
]

const memBy = {
  6: [{ id: 'm6', client_id: '6', hall: 'az', start_date: '2020-01-01', end_date: '2020-06-01' }],
}

ok(filterArchivedClientsByHall(clients, 'all', memBy).map((c) => c.id).join() === '1,2,3,6', 'all archived')
ok(filterArchivedClientsByHall(clients, 'pz', memBy).map((c) => c.id).join() === '1', 'archive pz')
ok(filterArchivedClientsByHall(clients, 'tz', memBy).map((c) => c.id).join() === '2', 'archive tz')
ok(filterArchivedClientsByHall(clients, 'az', memBy).map((c) => c.id).join() === '3,6', 'archive az + mem')
ok(clientMatchesArchiveHallFilter(clients[1], 'tz') === true, 'match tz')
ok(clientMatchesArchiveHallFilter(clients[1], 'pz') === false, 'tz not pz')
ok(clientMatchesArchiveHallFilter(clients[5], 'az', memBy['6']) === true, 'match az from mem')

const counts = countArchivedClientsByHall(clients, memBy)
ok(counts.all === 4 && counts.pz === 1 && counts.tz === 1 && counts.az === 2, 'counts with mem')

const opts = buildArchiveHallFilterOptions(clients, memBy)
ok(opts.length === 4, '4 chips')
ok(opts[0].id === '' && opts[0].count === 4, 'all chip')
ok(opts.find((o) => o.id === 'pz')?.count === 1, 'pz chip')
ok(opts.find((o) => o.id === 'tz')?.count === 1, 'tz chip')
ok(opts.find((o) => o.id === 'az')?.count === 2, 'az chip')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll admin-clients-archive-hall checks passed')
