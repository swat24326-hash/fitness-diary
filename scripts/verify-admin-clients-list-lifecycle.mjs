/**
 * node scripts/verify-admin-clients-list-lifecycle.mjs
 * Переход ПЗ→АЗ: список, меню, поиск, карточка.
 */
import {
  clientAdminVisibleHallSet,
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
  filterClientsByAdminListTab,
} from '../src/lib/admin/deskHallClientsCore.js'
import { buildClientHallStack } from '../src/lib/admin/adminClientsCrossHallSearchCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const asOf = '2026-08-22'
const client = {
  id: 'abaeva',
  name: 'Абаева Светлана',
  club_id: 'club1',
  trainer_id: 't-trainer',
  card_number: '5597',
}
const pzDepleted = {
  id: 'm-pz',
  client_id: 'abaeva',
  hall: 'pz',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  total_trainings: 10,
  used_trainings: 10,
}
const azLive = {
  id: 'm-az',
  client_id: 'abaeva',
  hall: 'az',
  start_date: '2026-06-01',
  end_date: '2026-12-31',
  total_trainings: 5,
  used_trainings: 0,
}
const mems = [pzDepleted, azLive]
const lifePzClosed = {
  id: 'l-pz',
  client_id: 'abaeva',
  club_id: 'club1',
  hall: 'pz',
  closed_at: '2026-08-21T12:00:00.000Z',
  close_reason: 'Перешёл в АЗ',
}
const ctx = { lifecycleRows: [lifePzClosed], asOf }

ok(
  shouldHideClientFromHallListTab({ client, memberships: mems, lifecycleRows: [lifePzClosed], hall: 'pz', asOf }),
  'ABAEVA: hide closed PZ when AZ live',
)
ok(!clientMatchesAdminListTab(client, 'active', mems, ctx), 'ABAEVA: not on PZ tab')
ok(clientMatchesAdminListTab(client, 'az', mems, ctx), 'ABAEVA: on AZ tab')

const memBy = { abaeva: mems }
ok(
  filterClientsByAdminListTab([client], 'active', memBy, ctx).length === 0,
  'ABAEVA: filter PZ empty',
)
ok(
  filterClientsByAdminListTab([client], 'az', memBy, ctx).length === 1,
  'ABAEVA: filter AZ has client',
)

ok(
  !shouldOfferAdminCloseHall({
    clientsTab: 'active',
    client,
    memberships: mems,
    lifecycleRows: [lifePzClosed],
    asOf,
  }),
  'ABAEVA: no close PZ — already closed',
)
ok(
  !shouldOfferAdminReopenHall({
    clientsTab: 'active',
    client,
    memberships: mems,
    lifecycleRows: [lifePzClosed],
    asOf,
  }),
  'ABAEVA: no reopen PZ on PZ tab — not listed',
)

const visible = clientAdminVisibleHallSet({ client, memberships: mems, lifecycleRows: [lifePzClosed], asOf })
ok(visible.has('az') && !visible.has('pz'), 'ABAEVA: visible halls AZ only')

const stack = buildClientHallStack(client, mems, {
  today: asOf,
  trainerName: 'Анжелика',
  lifecycleRows: [lifePzClosed],
})
ok(stack.length === 1 && stack[0].hall === 'az', 'ABAEVA: search stack AZ only')

ok(
  resolveAdminClientHallTabWithLifecycle(client, mems, 'az', ctx) === 'az',
  'ABAEVA: card opens on AZ',
)
ok(
  resolveAdminClientHallTabWithLifecycle(client, mems, null, ctx) === 'az',
  'ABAEVA: default tab AZ not PZ',
)

const depletedNotClosed = {
  id: 'c2',
  trainer_id: 't1',
  club_id: 'club1',
}
const pzOnlyDepleted = {
  id: 'm2',
  client_id: 'c2',
  hall: 'pz',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  total_trainings: 5,
  used_trainings: 5,
}
ok(
  shouldOfferAdminCloseDepletedHall({
    client: depletedNotClosed,
    memberships: [pzOnlyDepleted],
    lifecycleRows: [],
    hall: 'pz',
    asOf,
  }),
  'depleted PZ not closed — offer close',
)
ok(
  shouldOfferAdminCloseHall({
    clientsTab: 'active',
    client: depletedNotClosed,
    memberships: [pzOnlyDepleted],
    lifecycleRows: [],
    asOf,
  }),
  'depleted PZ — menu close via wrapper',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-admin-clients-list-lifecycle: ok')
