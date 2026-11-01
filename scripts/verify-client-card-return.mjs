/**
 * Возврат с карточки клиента к источнику (стратегия / ПНК / список).
 * node scripts/verify-client-card-return.mjs
 */
import {
  buildClientListsReturnHref,
  buildSalesStrategyReturnHref,
  clientCardBackLabel,
  clientCardParentCrumbLabel,
  normalizeClientCardFrom,
  resolveClientCardBackHref,
} from '../src/lib/admin/clientCardReturnCore.js'
import { buildClientCardDeepLink } from '../src/lib/admin/staffTaskDeepLinkCore.js'
import { buildBreadcrumbs } from '../src/lib/breadcrumbsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeClientCardFrom('strategy') === 'strategy', 'from strategy')
ok(normalizeClientCardFrom('evil') === '', 'from unknown empty')
ok(buildSalesStrategyReturnHref({ forAdmin: false }) === '/sales?tab=strategy', 'manager strategy href')
ok(
  buildSalesStrategyReturnHref({ forAdmin: true, clubId: 'c1' }) === '/admin/sales?club=c1&tab=strategy',
  'admin strategy href',
)

const card = buildClientCardDeepLink('cid', { forSales: true, clubId: 'c1', from: 'strategy' })
ok(card.includes('from=strategy') && card.includes('/sales/clients/cid'), 'deep link keeps from')

ok(
  resolveClientCardBackHref('club=c1&from=strategy', { isSalesManager: true }) === '/sales?tab=strategy',
  'back to strategy',
)
ok(
  resolveClientCardBackHref('club=c1&clientsTab=tz&page=2', { isSalesManager: true }) ===
    '/sales/clients?clientsTab=tz&page=2',
  'back to clients list state',
)
ok(clientCardBackLabel('strategy') === '← К стратегии', 'back label')
ok(clientCardParentCrumbLabel('strategy') === 'Стратегия', 'crumb label')

const crumbs = buildBreadcrumbs('/sales/clients/cid', '?from=strategy&club=c1')
ok(crumbs[1]?.label === 'Стратегия' && crumbs[1]?.to === '/sales?tab=strategy', 'breadcrumb strategy')

ok(
  resolveClientCardBackHref('from=pnk', { isSupervisor: true }) === '/club/pnk',
  'supervisor back to pnk',
)
ok(
  resolveClientCardBackHref('clientsTab=tz', { isSupervisor: true }) === '/club/clients?clientsTab=tz',
  'supervisor back to clients',
)
ok(
  buildClientCardDeepLink('cid', { forSupervisor: true, from: 'pnk' }) === '/club/clients/cid?from=pnk',
  'supervisor deep link',
)

ok(normalizeClientCardFrom('lists') === 'lists', 'from lists')
ok(
  buildClientListsReturnHref({ forAdmin: true, clubId: 'c1', listSearch: 'pool=archive&halls=tz' }) ===
    '/admin/client-lists?pool=archive&halls=tz&club=c1',
  'admin lists return keeps filters',
)
ok(
  resolveClientCardBackHref('club=c1&from=lists&pool=archive&halls=az&criterion=birthdays', {
    isSalesManager: true,
  }) === '/sales/client-lists?pool=archive&halls=az&criterion=birthdays',
  'back to lists restores filters',
)
ok(clientCardBackLabel('lists') === '← К спискам', 'lists back label')
ok(clientCardParentCrumbLabel('lists') === 'Списки', 'lists crumb')

process.exit(failed > 0 ? 1 : 0)
