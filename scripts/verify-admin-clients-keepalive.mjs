/**
 * node scripts/verify-admin-clients-keepalive.mjs
 */
import {
  adminClientsListBasePath,
  isAdminClientsCardPathname,
} from '../src/lib/admin/adminClientsKeepAliveCore.js'

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

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll admin clients keepalive checks passed')
