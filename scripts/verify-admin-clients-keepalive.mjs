/**
 * node scripts/verify-admin-clients-keepalive.mjs
 */
import {
  adminClientsListBasePath,
  isAdminClientsCardPathname,
  shouldHydrateAdminClientsSearchFromUrl,
} from '../src/lib/admin/adminClientsKeepAliveCore.js'
import {
  nextAdminClientsListSource,
  shouldShowAdminClientsDeviceSourceMeta,
} from '../src/lib/admin/adminClientsListReloadCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(adminClientsListBasePath('admin') === '/admin/clients', 'base admin')
ok(adminClientsListBasePath('sales_manager') === '/sales/clients', 'base sales')

const admin = '/admin/clients'
ok(!isAdminClientsCardPathname('/admin/clients', admin), 'list')
ok(!isAdminClientsCardPathname('/admin/clients/', admin), 'list trailing')
ok(isAdminClientsCardPathname('/admin/clients/c1', admin), 'card')
ok(isAdminClientsCardPathname('/admin/clients/c1/', admin), 'card trailing')
ok(!isAdminClientsCardPathname('/admin/clients/c1/extra', admin), 'nested not card')
ok(!isAdminClientsCardPathname('/admin/statistics', admin), 'other page')
ok(isAdminClientsCardPathname('/sales/clients/abc', '/sales/clients'), 'sales card')
ok(!isAdminClientsCardPathname('/sales/clients', '/sales/clients'), 'sales list')

ok(
  shouldHydrateAdminClientsSearchFromUrl(true, false) === true,
  'hydrate q при возврате на список',
)
ok(
  shouldHydrateAdminClientsSearchFromUrl(true, true) === false,
  'не hydrate q пока список уже открыт (иначе дёргается ввод)',
)
ok(
  shouldHydrateAdminClientsSearchFromUrl(false, true) === false,
  'не hydrate q когда список скрыт карточкой',
)

ok(
  nextAdminClientsListSource('admin_api', 'local', { silent: true }) === 'admin_api',
  'silent peek не откатывает admin_api → local',
)
ok(
  nextAdminClientsListSource('remote', 'local', { silent: true }) === 'remote',
  'silent peek не откатывает remote → local',
)
ok(
  nextAdminClientsListSource('admin_api', 'local', { silent: false }) === 'local',
  'полный reload может поставить local',
)
ok(
  nextAdminClientsListSource('local', 'admin_api', { silent: true }) === 'admin_api',
  'silent принимает облако',
)
ok(
  shouldShowAdminClientsDeviceSourceMeta({ settled: false, source: 'local' }) === false,
  'meta скрыта до ответа облака',
)
ok(
  shouldShowAdminClientsDeviceSourceMeta({ settled: true, source: 'admin_api' }) === false,
  'meta скрыта при admin_api',
)
ok(
  shouldShowAdminClientsDeviceSourceMeta({ settled: true, source: 'local' }) === true,
  'meta только после settled + local',
)
ok(
  shouldShowAdminClientsDeviceSourceMeta({ settled: true, source: 'local', cloudNeedsClub: true }) === false,
  'meta скрыта при cloudNeedsClub',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll admin clients keepalive checks passed')
