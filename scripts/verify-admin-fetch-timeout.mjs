/**
 * node scripts/verify-admin-fetch-timeout.mjs
 */
import {
  PORTABLE_ADMIN_FETCH_TIMEOUT_MS,
  VERCEL_ADMIN_FETCH_TIMEOUT_MS,
  isPortableAdminOrigin,
  resolveAdminFetchTimeoutMs,
} from '../src/lib/adminFetchTimeoutCore.js'
import {
  AUTH_PROFILE_CLOUD_UNAVAILABLE_RU,
  AUTH_PROFILE_MEMO_TTL_MS,
  AUTH_PROFILE_STALE_MAX_MS,
  classifyServiceRoleKeyShape,
  coalesceByKey,
  httpStatusForAuthProfileQuery,
  interpretUsersProfileQuery,
  readAuthProfileMemoHit,
} from '../api/_lib/authCallerProfileCore.js'
import {
  pruneVerifyBearerMemo,
  readVerifyBearerMemoHit,
  VERIFY_BEARER_MEMO_TTL_MS,
} from '../api/_lib/verifyBearerMemoCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

ok(isPortableAdminOrigin('http://158.160.190.61:8080') === true, 'Yandex IP:port = portable')
ok(isPortableAdminOrigin('https://fitness-diary-bice.vercel.app') === false, 'prod vercel = not portable')
ok(isPortableAdminOrigin('') === false, 'empty origin = vercel default')
ok(
  resolveAdminFetchTimeoutMs(undefined, 'http://158.160.190.61:8080') === PORTABLE_ADMIN_FETCH_TIMEOUT_MS,
  'hybrid default 20s',
)
ok(
  resolveAdminFetchTimeoutMs(undefined, 'https://fitness-diary-bice.vercel.app') === VERCEL_ADMIN_FETCH_TIMEOUT_MS,
  'vercel default 5s',
)
ok(resolveAdminFetchTimeoutMs(45_000, 'http://1.2.3.4:8080') === 45_000, 'explicit timeout wins')

const fresh = readVerifyBearerMemoHit('tok', { value: { user: { id: 'u1' } }, at: 1000 }, 1000 + 1_000)
ok(fresh?.user?.id === 'u1', 'memo hit while fresh')
const stale = readVerifyBearerMemoHit(
  'tok',
  { value: { user: { id: 'u1' } }, at: 1000 },
  1000 + VERIFY_BEARER_MEMO_TTL_MS + 1,
)
ok(stale === null, 'memo miss when stale')

const cache = new Map()
for (let i = 0; i < 5; i += 1) cache.set(`k${i}`, { at: i, value: {} })
pruneVerifyBearerMemo(cache, 3)
ok(cache.size === 3, 'prune keeps max')

ok(interpretUsersProfileQuery({ data: { role: 'admin' }, error: null }).kind === 'ok', 'profile ok')
ok(interpretUsersProfileQuery({ data: { role: 'admin' }, error: null }).profile?.role === 'admin', 'profile role kept')
ok(interpretUsersProfileQuery({ data: null, error: { message: 'fetch failed' } }).kind === 'query_error', 'query error ≠ empty role')
ok(httpStatusForAuthProfileQuery('query_error') === 503, 'cloud miss → 503 not 403')
ok(httpStatusForAuthProfileQuery('ok') === 200, 'ok profile → 200')
ok(AUTH_PROFILE_CLOUD_UNAVAILABLE_RU.includes('Облако'), 'honest RU message')

const profileFresh = readAuthProfileMemoHit(
  'u1',
  { flags: { isAdmin: true }, at: 1000 },
  1000 + 1_000,
)
ok(profileFresh?.isAdmin === true, 'profile memo hit')
const profileStale = readAuthProfileMemoHit(
  'u1',
  { flags: { isAdmin: true }, at: 1000 },
  1000 + AUTH_PROFILE_MEMO_TTL_MS + 1,
)
ok(profileStale === null, 'profile memo miss when stale')
ok(readAuthProfileMemoHit('', { flags: { isAdmin: true }, at: 1000 }, 1000) === null, 'empty user id no memo')
ok(
  readAuthProfileMemoHit(
    'u1',
    { flags: { isAdmin: true }, at: 1000 },
    1000 + AUTH_PROFILE_MEMO_TTL_MS + 1,
    AUTH_PROFILE_MEMO_TTL_MS,
    AUTH_PROFILE_STALE_MAX_MS,
  )?.isAdmin === true,
  'expired memo still usable as stale',
)

let starts = 0
const inflight = new Map()
const shared = coalesceByKey(inflight, 'u1', async () => {
  starts += 1
  return 'ok'
})
const shared2 = coalesceByKey(inflight, 'u1', async () => {
  starts += 1
  return 'other'
})
ok(shared === shared2, 'parallel profile reads share one promise')
ok((await shared) === 'ok', 'coalesced result')
ok(starts === 1, 'start once while inflight')
ok(classifyServiceRoleKeyShape('') === 'missing', 'empty service key')
ok(classifyServiceRoleKeyShape('[SET_ME]') === 'placeholder', 'stub service key')
ok(classifyServiceRoleKeyShape(`eyJ${'a'.repeat(80)}`) === 'ok', 'jwt-shaped service key')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('verify-admin-fetch-timeout: all passed')
