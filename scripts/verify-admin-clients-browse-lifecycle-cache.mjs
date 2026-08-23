/**
 * node scripts/verify-admin-clients-browse-lifecycle-cache.mjs
 *
 * Без client_hall_lifecycle вкладки/воронка завышают цифры;
 * chip = list только при одном контуре + lifecycle в снимке памяти.
 */
import {
  buildAdminClientsBrowseCounts,
  filterAdminClientsByBrowseMode,
  verifyAdminClientsBrowseChipParity,
} from '../src/lib/admin/adminClientsBrowseFilterCore.js'
import {
  invalidateAdminClientsListMemory,
  peekAdminClientsListMemory,
  writeAdminClientsListMemory,
} from '../src/lib/admin/adminClientsListMemoryCache.js'
import {
  resolveAdminClientsBrowseLifecycleRows,
  shouldReloadAdminClientsList,
  shouldReloadAdminDaySummaryFromStorage,
  notifyClientHallLifecycleChanged,
  notifyAdminClientsBrowseStorageChanged,
  invalidateAdminClientsBrowseGlanceCaches,
} from '../src/lib/admin/adminClientsListReloadCore.js'
import { invalidateAllAdminDaySummaryGlance } from '../src/lib/admin/daySummaryGlanceSession.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-08-23'
const club = 'club1'

/** Закрыли ПЗ, живёт на АЗ — без lifecycle ошибочно в ПЗ «Закончился». */
const closedPzLiveAz = {
  id: 'c-mix',
  trainer_id: 't1',
  club_id: club,
}
const closedPzMems = [
  {
    client_id: 'c-mix',
    hall: 'pz',
    start_date: '2026-01-01',
    end_date: '2026-08-10',
    total_trainings: 8,
    used_trainings: 8,
  },
  {
    client_id: 'c-mix',
    hall: 'az',
    start_date: '2026-06-01',
    end_date: '2026-12-01',
    total_trainings: 8,
    used_trainings: 2,
  },
]
const lifeClosedPz = {
  id: 'life1',
  client_id: 'c-mix',
  club_id: club,
  hall: 'pz',
  closed_at: '2026-08-01T12:00:00Z',
}

const expiredOnly = {
  id: 'c-exp',
  trainer_id: 't2',
  club_id: club,
}
const expiredMems = [
  {
    client_id: 'c-exp',
    hall: 'pz',
    start_date: '2026-01-01',
    end_date: '2026-08-10',
    total_trainings: 8,
    used_trainings: 8,
  },
]

const clients = [closedPzLiveAz, expiredOnly]
const memByClient = {
  'c-mix': closedPzMems,
  'c-exp': expiredMems,
}

const withoutLife = buildAdminClientsBrowseCounts({
  clients,
  memByClient,
  clientsTab: 'active',
  today,
  lifecycleRows: [],
})
const withLife = buildAdminClientsBrowseCounts({
  clients,
  memByClient,
  clientsTab: 'active',
  today,
  lifecycleRows: [lifeClosedPz],
})

ok(withoutLife.expired_recent === 2, 'stale: без lifecycle — 2 «Закончился» на ПЗ')
ok(withLife.expired_recent === 1, 'fresh: с lifecycle — 1 «Закончился» (закрытый ПЗ скрыт)')

const parityStale = verifyAdminClientsBrowseChipParity({
  clients,
  memByClient,
  clientsTab: 'active',
  today,
  lifecycleRows: [],
})
ok(parityStale.ok, 'chip=list даже без lifecycle (внутренняя согласованность)')

const parityFresh = verifyAdminClientsBrowseChipParity({
  clients,
  memByClient,
  clientsTab: 'active',
  today,
  lifecycleRows: [lifeClosedPz],
})
ok(parityFresh.ok, 'chip=list с lifecycle')

ok(
  filterAdminClientsByBrowseMode({
    clients,
    memByClient,
    clientsTab: 'active',
    today,
    browseMode: 'expired_recent',
    lifecycleRows: [lifeClosedPz],
  }).length === withLife.expired_recent,
  'list length = chip с lifecycle',
)

invalidateAdminClientsListMemory()
writeAdminClientsListMemory(club, {
  clients,
  memByClient,
  lifecycleRows: [lifeClosedPz],
  trainerNameById: {},
  truncated: false,
  source: 'local',
})
const mem = peekAdminClientsListMemory(club)
ok(Array.isArray(mem?.lifecycleRows) && mem.lifecycleRows.length === 1, 'memory хранит lifecycleRows')
ok(mem.lifecycleRows[0].client_id === 'c-mix', 'memory lifecycle client_id')

const staleMemLife = [{ id: 'old', client_id: 'c-mix', club_id: club, hall: 'pz', closed_at: null }]
const freshIdbLife = [lifeClosedPz]
ok(
  resolveAdminClientsBrowseLifecycleRows(freshIdbLife, staleMemLife).length === 1 &&
    resolveAdminClientsBrowseLifecycleRows(freshIdbLife, staleMemLife)[0].closed_at,
  'resolve: IDB lifecycle wins over memory',
)
ok(shouldReloadAdminClientsList({ reason: 'client-hall-lifecycle' }), 'reload on client-hall-lifecycle')
ok(shouldReloadAdminClientsList({ reason: 'client-archive-changed' }), 'reload on client-archive-changed')
ok(!shouldReloadAdminClientsList({ reason: 'exercises' }), 'ignore exercises')
ok(shouldReloadAdminClientsList({ reason: 'lite-pz-client-created' }), 'reload on lite-pz-client-created')
ok(shouldReloadAdminClientsList({ reason: 'desk-manual-client-created' }), 'reload on desk-manual-client-created')
ok(shouldReloadAdminDaySummaryFromStorage({ reason: 'desk-membership-ledger' }), 'day summary: desk ledger')
ok(shouldReloadAdminDaySummaryFromStorage({ reason: 'training-completed' }), 'day summary: training completed')
ok(shouldReloadAdminDaySummaryFromStorage({ reason: 'membership-dates-shifted' }), 'day summary: membership dates shifted')
ok(shouldReloadAdminDaySummaryFromStorage({ reason: 'desk-az-session-deduct' }), 'day summary: az session deduct')
ok(shouldReloadAdminDaySummaryFromStorage({ reason: 'sync-complete' }), 'day summary: sync complete')
ok(shouldReloadAdminDaySummaryFromStorage({ reason: 'lite-pz-client-created' }), 'day summary on lite-pz create')
ok(notifyAdminClientsBrowseStorageChanged !== undefined, 'unified browse notify exported')
ok(notifyClientHallLifecycleChanged !== undefined, 'notify helper exported')
ok(invalidateAdminClientsBrowseGlanceCaches !== undefined, 'browse glance invalidate exported')
ok(typeof invalidateAllAdminDaySummaryGlance === 'function', 'day summary glance clear all')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-admin-clients-browse-lifecycle-cache: ok')
