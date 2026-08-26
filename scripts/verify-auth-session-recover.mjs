/**
 * node scripts/verify-auth-session-recover.mjs
 */
import { isExpectedAuthSessionError } from '../src/lib/authSessionErrorCore.js'
import {
  planAuthInitWhenStoredEmpty,
  shouldClearGhostSessionAfterFailedRefresh,
} from '../src/lib/authSessionRecoverCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isExpectedAuthSessionError(new Error('Нет сессии — выйдите и войдите снова на планшете')), 'no session msg')
ok(isExpectedAuthSessionError(new Error('Сессия истекла — выйдите и войдите снова')), 'expired msg')
ok(!isExpectedAuthSessionError(new Error('Таймаут связи')), 'timeout not session')

ok(
  planAuthInitWhenStoredEmpty({
    hasStoredSession: true,
    hasLiveSessionUser: false,
    refreshRestoredUser: false,
  }) === 'clear',
  'ghost → clear',
)
ok(
  planAuthInitWhenStoredEmpty({
    hasStoredSession: true,
    hasLiveSessionUser: false,
    refreshRestoredUser: true,
  }) === 'ok',
  'refresh restored → ok',
)
ok(
  planAuthInitWhenStoredEmpty({
    hasStoredSession: false,
    hasLiveSessionUser: false,
    refreshRestoredUser: false,
  }) === 'ok',
  'no stored → ok',
)

ok(
  shouldClearGhostSessionAfterFailedRefresh({ hasLiveSessionUser: false, refreshError: true }),
  'failed refresh → clear ghost',
)
ok(
  !shouldClearGhostSessionAfterFailedRefresh({ hasLiveSessionUser: true, refreshError: true }),
  'live user → keep',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll auth session recover checks passed')
