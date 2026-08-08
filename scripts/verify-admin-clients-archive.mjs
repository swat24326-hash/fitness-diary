import {
  buildAdminClientsTodaySnapshot,
  mergeAdminPzBrowseFilterCounts,
  planAdminClubReconcilePrune,
  remoteClientIdsForReconcile,
  shouldShowAdminClientsList,
} from '../src/lib/admin/adminClientsBrowseCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const clients = [
  { id: 'a1', name: 'Активный' },
  { id: 'a2', name: 'Неактивный' },
  { id: 'arch', name: 'Архивный', archived_at: '2026-07-01T10:00:00Z' },
]

const memberships = [
  { client_id: 'a1', start_date: '2026-07-01', end_date: '2026-08-01', total_trainings: 8, used_trainings: 1 },
  { client_id: 'a2', start_date: '2026-05-01', end_date: '2026-06-01', total_trainings: 8, used_trainings: 8 },
]

const snap = buildAdminClientsTodaySnapshot(clients, memberships, '2026-07-14')
ok(snap.totalOperational === 2, 'archived excluded from total')
ok(snap.inactiveCount === 1, 'one inactive today')
ok(snap.activeTodayCount === 1, 'one active with membership today')
ok(snap.inactiveIds.has('a2'), 'inactive id set')
ok(snap.activeTodayIds.has('a1'), 'active today id set')

ok(
  shouldShowAdminClientsList({ query: '', trainerQuery: '', browseMode: 'none', clientsTab: 'active' }) === false,
  'empty browse hidden',
)
ok(
  shouldShowAdminClientsList({ query: 'ив', trainerQuery: '', browseMode: 'none', clientsTab: 'active' }) === true,
  'search opens list',
)
ok(
  shouldShowAdminClientsList({ query: '', trainerQuery: '', browseMode: 'inactive', clientsTab: 'active' }) === true,
  'inactive chip opens list',
)
ok(
  shouldShowAdminClientsList({ query: '', trainerQuery: '', browseMode: 'none', clientsTab: 'archive' }) === true,
  'archive tab opens list',
)
ok(
  shouldShowAdminClientsList({ query: '', trainerQuery: '', browseMode: 'none', clientsTab: 'tz' }) === false,
  'tz tab hides list until filter',
)

const local = [
  { id: 'c1', name: 'Вася' },
  { id: 'c2', name: 'Петя' },
]
const activeRemote = [{ id: 'c1', name: 'Вася', archived_at: null }]
const archivedRemote = [{ id: 'c2', name: 'Петя', archived_at: '2026-07-14T12:00:00Z' }]

const pruneActiveOnly = planAdminClubReconcilePrune(local, activeRemote, new Set(), { preserveArchived: true })
ok(pruneActiveOnly.includes('c2'), 'active-only remote prunes stale c2 (old bug)')

const combined = [...activeRemote, ...archivedRemote]
const pruneCombined = planAdminClubReconcilePrune(local, combined, new Set(), { preserveArchived: true })
ok(pruneCombined.length === 0, 'active+archive remote keeps trainer-archived client')

const remoteIds = remoteClientIdsForReconcile(combined)
ok(remoteIds.has('c1') && remoteIds.has('c2'), 'combined remote ids')

const merged = mergeAdminPzBrowseFilterCounts(
  { all: 99, inactive: 1, expired_recent: 3, pnk: 2 },
  { totalOperational: 101, inactiveCount: 4 },
)
ok(merged.all === 101, 'PZ merge: all from operational census')
ok(merged.inactive === 1, 'PZ merge: inactive stays funnel (not snapshot.inactiveCount=4)')
ok(merged.expired_recent === 3 && merged.pnk === 2, 'PZ merge: other funnel counts kept')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll admin clients archive/browse checks passed.')
