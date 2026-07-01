/**
 * Проверка правил определения сети (PWA / ложный offline).
 * node scripts/verify-network-reachability.mjs
 */
import { computeIsAppOnline, isHttpResponseReachable } from '../src/lib/networkReachability.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

ok(isHttpResponseReachable(200), '200 = reachable')
ok(isHttpResponseReachable(401), '401 = reachable (API ответил)')
ok(isHttpResponseReachable(404), '404 = reachable')
ok(isHttpResponseReachable(500), '500 = reachable (сервер жив)')
ok(isHttpResponseReachable(405), '405 = reachable')
ok(!isHttpResponseReachable(0), 'status 0 = not reachable')
ok(!isHttpResponseReachable(undefined), 'undefined = not reachable')
ok(!isHttpResponseReachable(99), '99 = not HTTP response')
ok(!isHttpResponseReachable(600), '600 = out of range')

ok(computeIsAppOnline(true, false), 'reachable → online')
ok(computeIsAppOnline(false, true), 'navigator.onLine → online (десктоп)')
ok(!computeIsAppOnline(false, false), 'probe fail + navigator offline → offline')
ok(computeIsAppOnline(false, true), 'PWA: probe fail но navigator true → online (запасной)')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll network reachability checks passed.')
