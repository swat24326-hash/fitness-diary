/**
 * Кэш идентичности / токены Supabase в localStorage (выход без повторного входа).
 * node scripts/verify-user-identity-cache.mjs
 */
import {
  clearPersistedSupabaseSession,
  hasPersistedSupabaseSession,
  listPersistedSupabaseAuthKeys,
} from '../src/lib/userIdentityCache.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const store = new Map()
globalThis.localStorage = {
  getItem(k) {
    return store.has(k) ? store.get(k) : null
  },
  setItem(k, v) {
    store.set(String(k), String(v))
  },
  removeItem(k) {
    store.delete(k)
  },
  get length() {
    return store.size
  },
  key(i) {
    return [...store.keys()][i] ?? null
  },
}

const url = 'https://abcdefgh.supabase.co'
const key = 'sb-abcdefgh-auth-token'

ok(!hasPersistedSupabaseSession(url), 'empty storage → no session')

store.set(key, JSON.stringify({ refresh_token: 'rt-1', access_token: 'at-1' }))
ok(hasPersistedSupabaseSession(url), 'refresh_token → session present')
ok(listPersistedSupabaseAuthKeys(url).includes(key), 'lists auth key')

clearPersistedSupabaseSession(url)
ok(!store.has(key), 'clear removes auth key')
ok(!hasPersistedSupabaseSession(url), 'after clear → no session')

store.set('sb-other-auth-token', JSON.stringify({ refresh_token: 'rt-2' }))
ok(hasPersistedSupabaseSession(url), 'any sb-*-auth-token counts')
clearPersistedSupabaseSession(url)
ok(!hasPersistedSupabaseSession(url), 'clear removes all sb auth tokens')

if (failed) process.exit(1)
console.log('verify-user-identity-cache: all passed')
