/**
 * Права менеджера продаж на клиентов клуба.
 * node scripts/verify-sales-manager-clients.mjs
 */
import {
  assertSalesManagerClientInsert,
  assertSalesManagerClientUpdate,
  assertSalesManagerSameClub,
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
ok(!isSalesManagerClientPushTable('trainings'), 'no trainings push')

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

ok(buildClientCardDeepLink('cid', { forSales: true }) === '/sales/clients/cid', 'sales deep link')
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
