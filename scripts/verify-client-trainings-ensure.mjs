/**
 * node scripts/verify-client-trainings-ensure.mjs
 */
import {
  CLIENT_TRAININGS_ENSURE_TTL_MS,
  shouldRefreshClientTrainingsFromCloud,
} from '../src/lib/clientTrainingsEnsureCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(
  shouldRefreshClientTrainingsFromCloud({ online: true, force: false, lastEnsureAtMs: null, nowMs: 1000, ttlMs: 90_000 }) ===
    true,
  'online first time refreshes even with local rows',
)
ok(
  shouldRefreshClientTrainingsFromCloud({
    online: true,
    force: false,
    lastEnsureAtMs: 1000,
    nowMs: 1000 + 1000,
    ttlMs: CLIENT_TRAININGS_ENSURE_TTL_MS,
  }) === false,
  'within ttl skip',
)
ok(
  shouldRefreshClientTrainingsFromCloud({
    online: true,
    force: false,
    lastEnsureAtMs: 1000,
    nowMs: 1000 + CLIENT_TRAININGS_ENSURE_TTL_MS + 1,
    ttlMs: CLIENT_TRAININGS_ENSURE_TTL_MS,
  }) === true,
  'after ttl refresh',
)
ok(
  shouldRefreshClientTrainingsFromCloud({ online: false, force: false, lastEnsureAtMs: null, nowMs: 1, ttlMs: 90_000 }) ===
    false,
  'offline no refresh',
)
ok(
  shouldRefreshClientTrainingsFromCloud({ online: false, force: true, lastEnsureAtMs: null, nowMs: 1, ttlMs: 90_000 }) ===
    true,
  'force even offline flag still true (caller checks online)',
)

if (failed) process.exit(1)
console.log('verify-client-trainings-ensure: all ok')
