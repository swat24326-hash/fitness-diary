/**
 * node scripts/verify-desk-hall-clients.mjs
 */
import {
  clientMatchesAdminListTab,
  countClientsByAdminListTab,
  filterClientsByAdminListTab,
  normalizeAdminClientsListTab,
  normalizeDeskHall,
} from '../src/lib/admin/deskHallClientsCore.js'
import { shouldShowAdminClientsList } from '../src/lib/admin/adminClientsBrowseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeDeskHall('ТЗ') === 'tz', 'hall tz')
ok(normalizeDeskHall('az') === 'az', 'hall az')
ok(normalizeDeskHall('') == null, 'hall empty')
ok(normalizeAdminClientsListTab('tz') === 'tz', 'tab tz')
ok(normalizeAdminClientsListTab('x') === 'active', 'tab default')

const clients = [
  { id: '1', name: 'A', desk_hall: null },
  { id: '2', name: 'B', desk_hall: 'tz' },
  { id: '3', name: 'C', desk_hall: 'az' },
  { id: '4', name: 'D', desk_hall: 'tz', archived_at: '2026-01-01' },
]

ok(filterClientsByAdminListTab(clients, 'active').map((c) => c.id).join() === '1', 'active only plain')
ok(filterClientsByAdminListTab(clients, 'tz').map((c) => c.id).join() === '2', 'tz not archived')
ok(filterClientsByAdminListTab(clients, 'az').map((c) => c.id).join() === '3', 'az')
ok(filterClientsByAdminListTab(clients, 'archive').map((c) => c.id).join() === '4', 'archive')
ok(clientMatchesAdminListTab(clients[1], 'active') === false, 'tz not in clients tab')

const counts = countClientsByAdminListTab(clients)
ok(counts.active === 1 && counts.tz === 1 && counts.az === 1 && counts.archive === 1, 'counts')

ok(
  shouldShowAdminClientsList({ query: '', trainerQuery: '', browseMode: 'none', clientsTab: 'tz' }) === false,
  'tz tab hides list until filter',
)
ok(
  shouldShowAdminClientsList({ query: '', trainerQuery: '', browseMode: 'expiring', clientsTab: 'tz' }) === true,
  'tz filter opens list',
)
ok(
  shouldShowAdminClientsList({ query: '', trainerQuery: '', browseMode: 'none', clientsTab: 'az' }) === false,
  'az tab hides list until filter',
)
ok(
  shouldShowAdminClientsList({ query: '', trainerQuery: '', browseMode: 'all', clientsTab: 'az' }) === true,
  'az all opens list',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll desk hall clients checks passed')
