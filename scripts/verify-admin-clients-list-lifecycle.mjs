/**
 * node scripts/verify-admin-clients-list-lifecycle.mjs
 * Списки Клиенты + lifecycle: вкладки, меню, поиск, карточка.
 * Матрица L-A…L-F (критические + нестандартные).
 */
import {
  clientAdminVisibleHallSet,
  isAdminListEffectiveClubArchive,
  resolveAdminClientHallTabWithLifecycle,
  shouldHideClientFromHallListTab,
  shouldOfferAdminCloseDepletedHall,
} from '../src/lib/admin/adminClientsListLifecycleCore.js'
import {
  shouldOfferAdminCloseHall,
  shouldOfferAdminReopenHall,
} from '../src/lib/admin/adminClientsHallLifecycleMenuCore.js'
import {
  clientMatchesAdminListTab,
  countClientsByAdminListTab,
  filterClientsByAdminListTab,
} from '../src/lib/admin/deskHallClientsCore.js'
import { buildClientHallStack } from '../src/lib/admin/adminClientsCrossHallSearchCore.js'
import { resolveInitialClientHallTab } from '../src/lib/admin/clientHallTabsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const asOf = '2026-08-22'

function lifeRow(clientId, hall, closedAt = '2026-08-21T12:00:00.000Z') {
  return {
    id: `l-${clientId}-${hall}`,
    client_id: clientId,
    club_id: 'club1',
    hall,
    closed_at: closedAt,
    close_reason: 'test',
  }
}

function mem(clientId, hall, opts = {}) {
  return {
    id: `m-${clientId}-${hall}`,
    client_id: clientId,
    hall,
    start_date: opts.start ?? '2026-01-01',
    end_date: opts.end ?? '2026-12-31',
    total_trainings: opts.total ?? 10,
    used_trainings: opts.used ?? 0,
  }
}

function ctxFor(rows) {
  return { lifecycleRows: rows, asOf }
}

function tabMatch(client, tab, mems, ctx) {
  return clientMatchesAdminListTab(client, tab, mems, ctx)
}

// --- L-A: critical list tabs ---
console.log('\n--- L-A critical list tabs ---')

const abaeva = {
  id: 'abaeva',
  name: 'Абаева Светлана',
  club_id: 'club1',
  trainer_id: 't-trainer',
}
const abaevaMems = [
  mem('abaeva', 'pz', { total: 10, used: 10 }),
  mem('abaeva', 'az', { total: 5, used: 0 }),
]
const abaevaCtx = ctxFor([lifeRow('abaeva', 'pz')])

ok(
  shouldHideClientFromHallListTab({
    client: abaeva,
    memberships: abaevaMems,
    lifecycleRows: abaevaCtx.lifecycleRows,
    hall: 'pz',
    asOf,
  }),
  'L-A1: closed PZ + live AZ — hide from PZ tab',
)
ok(!tabMatch(abaeva, 'active', abaevaMems, abaevaCtx), 'L-A1: not on ПЗ')
ok(tabMatch(abaeva, 'az', abaevaMems, abaevaCtx), 'L-A1: on АЗ')
ok(
  filterClientsByAdminListTab([abaeva], 'active', { abaeva: abaevaMems }, abaevaCtx).length === 0,
  'L-A1: filter ПЗ empty',
)
ok(
  filterClientsByAdminListTab([abaeva], 'az', { abaeva: abaevaMems }, abaevaCtx).length === 1,
  'L-A1: filter АЗ has client',
)

const pzTzClient = { id: 'c-pztz', trainer_id: 't1', club_id: 'club1' }
const pzTzMems = [mem('c-pztz', 'pz'), mem('c-pztz', 'tz')]
const pzClosedTzLiveCtx = ctxFor([lifeRow('c-pztz', 'pz')])
ok(
  shouldHideClientFromHallListTab({
    client: pzTzClient,
    memberships: pzTzMems,
    lifecycleRows: pzClosedTzLiveCtx.lifecycleRows,
    hall: 'pz',
    asOf,
  }),
  'L-A2: closed PZ + live TZ — hide PZ',
)
ok(!tabMatch(pzTzClient, 'active', pzTzMems, pzClosedTzLiveCtx), 'L-A2: not on ПЗ')
ok(tabMatch(pzTzClient, 'tz', pzTzMems, pzClosedTzLiveCtx), 'L-A2: on ТЗ')

const tzPzClient = { id: 'c-tzpz', trainer_id: 't1', club_id: 'club1' }
const tzPzMems = [mem('c-tzpz', 'pz'), mem('c-tzpz', 'tz')]
const tzClosedPzLiveCtx = ctxFor([lifeRow('c-tzpz', 'tz')])
ok(
  shouldHideClientFromHallListTab({
    client: tzPzClient,
    memberships: tzPzMems,
    lifecycleRows: tzClosedPzLiveCtx.lifecycleRows,
    hall: 'tz',
    asOf,
  }),
  'L-A3: closed TZ + live PZ — hide TZ',
)
ok(tabMatch(tzPzClient, 'active', tzPzMems, tzClosedPzLiveCtx), 'L-A3: on ПЗ')
ok(!tabMatch(tzPzClient, 'tz', tzPzMems, tzClosedPzLiveCtx), 'L-A3: not on ТЗ')

const pzOnlyClosed = { id: 'c-pzonly', trainer_id: 't1', club_id: 'club1' }
const pzOnlyMems = [mem('c-pzonly', 'pz', { total: 5, used: 5 })]
const pzOnlyClosedCtx = ctxFor([lifeRow('c-pzonly', 'pz')])
ok(
  shouldHideClientFromHallListTab({
    client: pzOnlyClosed,
    memberships: pzOnlyMems,
    lifecycleRows: pzOnlyClosedCtx.lifecycleRows,
    hall: 'pz',
    asOf,
  }),
  'L-A4: closed depleted PZ — hide from ПЗ (reopen невозможен)',
)
ok(!tabMatch(pzOnlyClosed, 'active', pzOnlyMems, pzOnlyClosedCtx), 'L-A4: not on ПЗ tab')
ok(tabMatch(pzOnlyClosed, 'archive', pzOnlyMems, pzOnlyClosedCtx), 'L-A4: on Архив like trainer')
ok(
  isAdminListEffectiveClubArchive({
    client: pzOnlyClosed,
    memberships: pzOnlyMems,
    lifecycleRows: pzOnlyClosedCtx.lifecycleRows,
    asOf,
  }),
  'L-A4: effective club archive without archived_at',
)

const pzOnlyClosedLiveMems = [mem('c-pzonly-live', 'pz', { total: 8, used: 2 })]
const pzOnlyClosedLive = { id: 'c-pzonly-live', trainer_id: 't1', club_id: 'club1' }
const pzOnlyClosedLiveCtx = ctxFor([lifeRow('c-pzonly-live', 'pz')])
ok(
  !shouldHideClientFromHallListTab({
    client: pzOnlyClosedLive,
    memberships: pzOnlyClosedLiveMems,
    lifecycleRows: pzOnlyClosedLiveCtx.lifecycleRows,
    hall: 'pz',
    asOf,
  }),
  'L-A4b: closed PZ + live mem — stay on ПЗ (reopen path)',
)
ok(tabMatch(pzOnlyClosedLive, 'active', pzOnlyClosedLiveMems, pzOnlyClosedLiveCtx), 'L-A4b: still on ПЗ tab')

const multiOpen = { id: 'c-multi', trainer_id: 't1', club_id: 'club1' }
const multiMems = [mem('c-multi', 'pz'), mem('c-multi', 'tz')]
ok(tabMatch(multiOpen, 'active', multiMems, ctxFor([])), 'L-A5: PZ+TZ open — on ПЗ')
ok(tabMatch(multiOpen, 'tz', multiMems, ctxFor([])), 'L-A5: PZ+TZ open — on ТЗ')

const bothClosedAzLive = { id: 'c-both', trainer_id: 't1', club_id: 'club1' }
const bothClosedMems = [
  mem('c-both', 'pz', { total: 10, used: 10 }),
  mem('c-both', 'tz', { total: 8, used: 8 }),
  mem('c-both', 'az'),
]
const bothClosedCtx = ctxFor([lifeRow('c-both', 'pz'), lifeRow('c-both', 'tz')])
const bothVisible = clientAdminVisibleHallSet({
  client: bothClosedAzLive,
  memberships: bothClosedMems,
  lifecycleRows: bothClosedCtx.lifecycleRows,
  asOf,
})
ok(bothVisible.size === 1 && bothVisible.has('az'), 'L-A6: closed PZ+TZ, live AZ — AZ only')
ok(
  countClientsByAdminListTab([bothClosedAzLive], { 'c-both': bothClosedMems }, bothClosedCtx).az === 1,
  'L-A7: counts — AZ=1',
)
ok(
  countClientsByAdminListTab([bothClosedAzLive], { 'c-both': bothClosedMems }, bothClosedCtx).active === 0,
  'L-A7: counts — ПЗ=0',
)

// --- L-B: guards / errors ---
console.log('\n--- L-B guards ---')

ok(tabMatch(abaeva, 'active', abaevaMems, null), 'L-B1: no ctx — legacy ПЗ via trainer_id')
ok(
  !tabMatch({ id: 'x', archived_at: '2026-01-01' }, 'active', [], ctxFor([])),
  'L-B2: archived — not on ПЗ',
)
ok(
  tabMatch({ id: 'x', archived_at: '2026-01-01' }, 'archive', [], ctxFor([])),
  'L-B2: archived — on Архив',
)
ok(
  !shouldOfferAdminCloseHall({
    clientsTab: 'active',
    client: { id: 'x', archived_at: '2026-01-01' },
    memberships: [mem('x', 'pz')],
    lifecycleRows: [],
    asOf,
  }),
  'L-B3: club archived — no close',
)
ok(
  !shouldOfferAdminCloseHall({
    clientsTab: 'archive',
    client: { id: 'x', club_id: 'club1' },
    memberships: [mem('x', 'pz')],
    lifecycleRows: [],
    asOf,
  }),
  'L-B4: archive tab — no close',
)
ok(
  !shouldOfferAdminReopenHall({
    clientsTab: 'archive',
    client: { id: 'x', club_id: 'club1' },
    memberships: [mem('x', 'tz')],
    lifecycleRows: [lifeRow('x', 'tz')],
    asOf,
  }),
  'L-B4: archive tab — no reopen',
)

// --- L-C: menu close / reopen ---
console.log('\n--- L-C menu ---')

ok(
  !shouldOfferAdminCloseHall({
    clientsTab: 'active',
    client: abaeva,
    memberships: abaevaMems,
    lifecycleRows: abaevaCtx.lifecycleRows,
    asOf,
  }),
  'L-C1: closed PZ — no close',
)
ok(
  shouldOfferAdminCloseHall({
    clientsTab: 'active',
    client: { id: 'c-live', trainer_id: 't1', club_id: 'club1' },
    memberships: [mem('c-live', 'pz')],
    lifecycleRows: [],
    asOf,
  }),
  'L-C2: live PZ — offer close',
)

const depletedNotClosed = { id: 'c2', trainer_id: 't1', club_id: 'club1' }
const pzOnlyDepleted = [mem('c2', 'pz', { total: 5, used: 5 })]
ok(
  shouldOfferAdminCloseDepletedHall({
    client: depletedNotClosed,
    memberships: pzOnlyDepleted,
    lifecycleRows: [],
    hall: 'pz',
    asOf,
  }),
  'L-C3: depleted PZ not closed — offer close',
)
ok(
  shouldOfferAdminCloseHall({
    clientsTab: 'active',
    client: depletedNotClosed,
    memberships: pzOnlyDepleted,
    lifecycleRows: [],
    asOf,
  }),
  'L-C3: depleted PZ — menu close',
)

const tzReopenClient = { id: 'c-reopen', club_id: 'club1' }
const tzReopenMems = [mem('c-reopen', 'tz')]
const tzReopenCtx = ctxFor([lifeRow('c-reopen', 'tz')])
ok(
  shouldOfferAdminReopenHall({
    clientsTab: 'tz',
    client: tzReopenClient,
    memberships: tzReopenMems,
    lifecycleRows: tzReopenCtx.lifecycleRows,
    asOf,
  }),
  'L-C4: closed TZ + live mem — reopen on ТЗ tab',
)
ok(
  !shouldOfferAdminReopenHall({
    clientsTab: 'active',
    client: pzOnlyClosed,
    memberships: pzOnlyMems,
    lifecycleRows: pzOnlyClosedCtx.lifecycleRows,
    asOf,
  }),
  'L-C5: closed PZ depleted — no reopen without live mem',
)
ok(
  shouldOfferAdminCloseHall({
    clientsTab: 'tz',
    client: { id: 'c-tz', club_id: 'club1', desk_hall: 'tz' },
    memberships: [mem('c-tz', 'tz')],
    lifecycleRows: [],
    asOf,
  }),
  'L-C6: ТЗ tab — close TZ not PZ',
)

// --- L-D: card + search ---
console.log('\n--- L-D card + search ---')

const stack = buildClientHallStack(abaeva, abaevaMems, {
  today: asOf,
  trainerName: 'Анжелика',
  lifecycleRows: abaevaCtx.lifecycleRows,
})
ok(stack.length === 1 && stack[0].hall === 'az', 'L-D1: search stack AZ only')

ok(
  resolveAdminClientHallTabWithLifecycle(abaeva, abaevaMems, null, abaevaCtx) === 'az',
  'L-D2: default tab AZ not PZ',
)
ok(
  resolveAdminClientHallTabWithLifecycle(abaeva, abaevaMems, 'pz', abaevaCtx) === 'az',
  'L-D2: preferred PZ when hidden — fallback AZ',
)
ok(
  resolveAdminClientHallTabWithLifecycle(abaeva, abaevaMems, 'az', abaevaCtx) === 'az',
  'L-D3: preferred AZ — stays AZ',
)
ok(
  resolveInitialClientHallTab(abaeva, abaevaMems, 'pz', abaevaCtx) === 'az',
  'L-D4: resolveInitialClientHallTab with lifecycle',
)

// --- L-F: non-standard ---
console.log('\n--- L-F non-standard ---')

const pnkClient = { id: 'c-pnk', lifecycle: 'pnk', trainer_id: 't1', club_id: 'club1' }
const pnkMems = [mem('c-pnk', 'tz')]
const pnkCtx = ctxFor([lifeRow('c-pnk', 'tz')])
ok(tabMatch(pnkClient, 'active', pnkMems, pnkCtx), 'L-F1: PNK + closed TZ — still on ПЗ (trainer_id)')
ok(tabMatch(pnkClient, 'tz', pnkMems, pnkCtx), 'L-F1: PNK + closed TZ + live mem — on ТЗ for reopen')

const upcomingAz = {
  id: 'c-up',
  trainer_id: 't1',
  club_id: 'club1',
}
const upcomingMems = [
  mem('c-up', 'pz', { total: 10, used: 10 }),
  mem('c-up', 'az', { start: '2026-09-01', end: '2026-12-01', total: 8, used: 0 }),
]
const upcomingCtx = ctxFor([lifeRow('c-up', 'pz')])
ok(
  shouldHideClientFromHallListTab({
    client: upcomingAz,
    memberships: upcomingMems,
    lifecycleRows: upcomingCtx.lifecycleRows,
    hall: 'pz',
    asOf,
  }),
  'L-F2: closed PZ + upcoming AZ — hide PZ',
)

const foreignLife = ctxFor([lifeRow('other-client', 'pz')])
ok(
  !shouldHideClientFromHallListTab({
    client: abaeva,
    memberships: abaevaMems,
    lifecycleRows: foreignLife.lifecycleRows,
    hall: 'pz',
    asOf,
  }),
  'L-F3: foreign lifecycle client_id — no hide',
)

const depletedAzClient = { id: 'c-dep', trainer_id: 't1', club_id: 'club1' }
const depletedAzMems = [
  mem('c-dep', 'pz'),
  mem('c-dep', 'az', { total: 8, used: 8 }),
]
const pzClosedDepletedAzCtx = ctxFor([lifeRow('c-dep', 'pz')])
ok(
  !shouldHideClientFromHallListTab({
    client: depletedAzClient,
    memberships: depletedAzMems,
    lifecycleRows: pzClosedDepletedAzCtx.lifecycleRows,
    hall: 'pz',
    asOf,
  }),
  'L-F4: closed PZ + depleted AZ only — stay on ПЗ (no other open)',
)

const azClosedLive = { id: 'c-azr', club_id: 'club1', desk_hall: 'az' }
const azClosedMems = [mem('c-azr', 'az')]
const azClosedCtx = ctxFor([lifeRow('c-azr', 'az')])
ok(
  shouldOfferAdminReopenHall({
    clientsTab: 'az',
    client: azClosedLive,
    memberships: azClosedMems,
    lifecycleRows: azClosedCtx.lifecycleRows,
    asOf,
  }),
  'L-F5: closed AZ + live mem — reopen on АЗ tab',
)

const mixedList = [abaeva, multiOpen]
const mixedBy = { abaeva: abaevaMems, 'c-multi': multiMems }
ok(
  filterClientsByAdminListTab(mixedList, 'active', mixedBy, abaevaCtx).length === 1,
  'L-F6: mixed filter — only multi on ПЗ',
)
ok(
  filterClientsByAdminListTab(mixedList, 'az', mixedBy, abaevaCtx).length === 1,
  'L-F6: mixed filter — abaeva on АЗ',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-admin-clients-list-lifecycle: ok')
