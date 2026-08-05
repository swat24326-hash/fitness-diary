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

const clients = [
  { id: '1', name: 'A', desk_hall: null, archived_at: '2026-01-01' },
  { id: '2', name: 'B', desk_hall: 'tz', archived_at: '2026-01-02' },
  { id: '3', name: 'C', desk_hall: 'az', archived_at: '2026-01-03' },
  { id: '4', name: 'D', desk_hall: null }, // active PZ — not in archive
  { id: '5', name: 'E', desk_hall: 'tz' }, // active TZ
]

ok(filterArchivedClientsByHall(clients, 'all').map((c) => c.id).join() === '1,2,3', 'all archived')
ok(filterArchivedClientsByHall(clients, 'pz').map((c) => c.id).join() === '1', 'archive pz')
ok(filterArchivedClientsByHall(clients, 'tz').map((c) => c.id).join() === '2', 'archive tz')
ok(filterArchivedClientsByHall(clients, 'az').map((c) => c.id).join() === '3', 'archive az')
ok(clientMatchesArchiveHallFilter(clients[1], 'tz') === true, 'match tz')
ok(clientMatchesArchiveHallFilter(clients[1], 'pz') === false, 'tz not pz')

const counts = countArchivedClientsByHall(clients)
ok(counts.all === 3 && counts.pz === 1 && counts.tz === 1 && counts.az === 1, 'counts')

const opts = buildArchiveHallFilterOptions(clients)
ok(opts.length === 4, '4 chips')
ok(opts[0].id === '' && opts[0].count === 3, 'all chip')
ok(opts.find((o) => o.id === 'pz')?.count === 1, 'pz chip')
ok(opts.find((o) => o.id === 'tz')?.count === 1, 'tz chip')
ok(opts.find((o) => o.id === 'az')?.count === 1, 'az chip')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll admin-clients-archive-hall checks passed')
