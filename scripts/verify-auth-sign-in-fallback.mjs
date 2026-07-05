/**
 * Fallback входа: таймаут /api/auth-sign-in → Supabase напрямую.
 * node scripts/verify-auth-sign-in-fallback.mjs
 */
import { isAuthApiTransportError } from '../src/lib/authSignInTransport.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

ok(isAuthApiTransportError('Failed to fetch'), 'english failed to fetch')
ok(isAuthApiTransportError('The operation was aborted'), 'abort')
ok(isAuthApiTransportError('NetworkError when attempting to fetch resource.'), 'networkerror')
ok(
  isAuthApiTransportError('Не удалось связаться с сервером входа. Таймаут сервера входа'),
  'russian login server timeout',
)
ok(isAuthApiTransportError('Не удалось связаться с сервером входа. timeout'), 'mixed ru/en timeout')
ok(!isAuthApiTransportError('Неверный пароль'), 'wrong password is not transport')
ok(!isAuthApiTransportError('Пользователь с таким логином не найден'), 'not found is not transport')

if (failed) process.exit(1)
console.log('verify-auth-sign-in-fallback: all passed')
