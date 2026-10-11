/** Незнакомый адрес: обновиться и открыть его же (раздел из новой версии), без цикла перезагрузок. */
import { decideUnknownRoute } from '../src/lib/appUnknownRouteCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

ok(decideUnknownRoute({ path: '/coach', triedPath: null, hasNewVersion: true }) === 'update', 'есть новая версия — обновиться на том же адресе (/coach со старой сборкой)')
ok(decideUnknownRoute({ path: '/coach', triedPath: null, hasNewVersion: false }) === 'home', 'новой версии нет — на главную, как раньше')
ok(decideUnknownRoute({ path: '/coach', triedPath: '/coach', hasNewVersion: true }) === 'home', 'уже обновлялись ради этого адреса — на главную, без цикла')
ok(decideUnknownRoute({ path: '/new-section', triedPath: '/coach', hasNewVersion: true }) === 'update', 'попытка для другого адреса не мешает')

if (failed) {
  console.error(`\nverify-unknown-route: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-unknown-route: ok')
