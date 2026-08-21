/**
 * Права менеджера продаж на клиентов клуба.
 * node scripts/verify-sales-manager-clients.mjs
 */
import {
  assertSalesManagerClientInsert,
  assertSalesManagerClientUpdate,
  assertSalesManagerDeskClientDelete,
  assertSalesManagerSameClub,
  canSalesManagerHardDeleteClient,
  canUseSyncPushApi,
  isDeskHallTzOrAz,
  isDeskOnlyClientForManagerDelete,
  isSalesManagerClientPushTable,
  SALES_MANAGER_CLIENT_PUSH_TABLES,
} from '../src/lib/admin/salesManagerClientsAccessCore.js'
import { buildClientCardDeepLink, resolveDispatchDeepLink } from '../src/lib/admin/staffTaskDeepLinkCore.js'
import { buildBreadcrumbs } from '../src/lib/breadcrumbsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(SALES_MANAGER_CLIENT_PUSH_TABLES.includes('clients'), 'push clients')
ok(SALES_MANAGER_CLIENT_PUSH_TABLES.includes('memberships'), 'push memberships')
ok(isSalesManagerClientPushTable('clients'), 'is clients table')
ok(!isSalesManagerClientPushTable('trainings'), 'no trainings push (write)')
ok(canUseSyncPushApi({ isSalesManager: true }), 'manager may call push-record')
ok(canUseSyncPushApi({ isTrainer: true }), 'trainer may call push-record')
ok(canUseSyncPushApi({ isAdmin: true }), 'admin may call push-record')
ok(!canUseSyncPushApi({}), 'anonymous blocked from push-record')
ok(isDeskHallTzOrAz('тз') && isDeskHallTzOrAz('аз'), 'cyrillic desk hall')

ok(assertSalesManagerSameClub('c1', 'c1').ok, 'same club')
ok(!assertSalesManagerSameClub('c1', 'c2').ok, 'other club blocked')
ok(!assertSalesManagerSameClub('', 'c1').ok, 'empty profile club')

ok(
  assertSalesManagerClientInsert('c1', { club_id: 'c1', desk_hall: 'tz' }).ok,
  'desk tz insert',
)
ok(
  assertSalesManagerClientInsert('c1', { club_id: 'c1', trainer_id: 't1' }).ok,
  'lite/pz with trainer',
)
ok(
  !assertSalesManagerClientInsert('c1', { club_id: 'c1', desk_hall: 'tz', trainer_id: 't1' }).ok,
  'desk + trainer blocked',
)
ok(!assertSalesManagerClientInsert('c1', { club_id: 'c2', trainer_id: 't1' }).ok, 'wrong club insert')
ok(!assertSalesManagerClientInsert('c1', { club_id: 'c1' }).ok, 'no trainer no desk')

ok(assertSalesManagerClientUpdate('c1', 'c1', { name: 'A' }).ok, 'update same club')
ok(!assertSalesManagerClientUpdate('c1', 'c2', { name: 'A' }).ok, 'update other club')
ok(!assertSalesManagerClientUpdate('c1', 'c1', { club_id: 'c2' }).ok, 'move club blocked')

ok(isDeskHallTzOrAz('tz') && isDeskHallTzOrAz('az'), 'desk hall flags')
ok(!isDeskHallTzOrAz(null) && !isDeskHallTzOrAz(''), 'not desk')
ok(assertSalesManagerDeskClientDelete('c1', { club_id: 'c1', desk_hall: 'tz' }).ok, 'delete desk tz')
ok(assertSalesManagerDeskClientDelete('c1', { club_id: 'c1', desk_hall: 'az' }).ok, 'delete desk az')
ok(!assertSalesManagerDeskClientDelete('c1', { club_id: 'c1', desk_hall: null }).ok, 'no delete pz')
ok(!assertSalesManagerDeskClientDelete('c1', { club_id: 'c2', desk_hall: 'tz' }).ok, 'no delete other club')
ok(
  !assertSalesManagerDeskClientDelete('c1', { club_id: 'c1', desk_hall: 'tz', trainer_id: 't1' }).ok,
  'no delete desk with trainer',
)
ok(
  !isDeskOnlyClientForManagerDelete(
    { id: 'x', desk_hall: 'tz' },
    {
      memberships: [
        {
          id: 'm1',
          client_id: 'x',
          hall: 'pz',
          start_date: '2020-01-01',
          end_date: '2099-01-01',
          total_trainings: null,
        },
      ],
      lifecycleRows: [],
      asOf: '2026-08-22',
    },
  ),
  'no delete multi-hall with live pz',
)
ok(
  isDeskOnlyClientForManagerDelete(
    { id: 'x', desk_hall: 'tz', trainer_id: null },
    { memberships: [], lifecycleRows: [], asOf: '2026-08-22' },
  ),
  'desk-only tz ok',
)
ok(canSalesManagerHardDeleteClient(false, { desk_hall: null }), 'admin can delete any')
ok(canSalesManagerHardDeleteClient(true, { desk_hall: 'tz' }), 'manager delete desk')
ok(!canSalesManagerHardDeleteClient(true, { desk_hall: null }), 'manager no delete pz')
ok(
  !canSalesManagerHardDeleteClient(true, { desk_hall: 'tz', trainer_id: 't1' }),
  'manager no delete with trainer',
)

ok(buildClientCardDeepLink('cid', { forSales: true }) === '/sales/clients/cid', 'sales deep link')
ok(
  buildClientCardDeepLink('cid', { forSales: true, from: 'strategy' }).includes('from=strategy'),
  'sales deep link from strategy',
)
ok(
  resolveDispatchDeepLink({
    recipient_role: 'sales_manager',
    context_json: { client_id: 'cid' },
  }) === '/sales/clients/cid',
  'dispatch → sales client',
)

const crumbs = buildBreadcrumbs('/sales/clients/cid').map((c) => c.label)
ok(crumbs.join(' › ') === 'План продаж › Клиенты › Карточка клиента', 'breadcrumbs sales client')
ok(
  buildBreadcrumbs('/sales/clients')[1]?.to === '/sales/clients',
  'breadcrumbs sales clients list',
)

process.exit(failed > 0 ? 1 : 0)
