/**
 * Лимит неудачных входов. На Supabase он встроенный, на своём сервере (C2) — только наш.
 * Ключ «логин + IP»: планшеты зала за одним NAT не блокируют друг друга.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  AUTH_FAIL_LIMIT_PER_IP,
  AUTH_FAIL_LIMIT_PER_LOGIN,
  AUTH_FAIL_WINDOW_MS,
  authRateLimitedMessageRu,
  clientIpFromHeaders,
  createAuthFailLimiter,
} from '../api/_lib/authRateLimitCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

let t = 1_000_000
const lim = createAuthFailLimiter({ now: () => t })
const HALL = '10.0.0.1'

console.log('per login')
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_LOGIN; i++) lim.recordOutcome('ivan', HALL, 401)
const blocked = lim.check('ivan', HALL)
ok(!blocked.ok, `после ${AUTH_FAIL_LIMIT_PER_LOGIN} ошибок логин закрыт`)
ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= AUTH_FAIL_WINDOW_MS / 1000, 'Retry-After в пределах окна')
ok(lim.check('IVAN ', HALL).ok === false, 'регистр и пробелы логина не обходят лимит')
ok(lim.check('olga', HALL).ok, 'другой тренер с того же IP зала входит')
ok(lim.check('ivan', '5.5.5.5').ok, 'чужой IP не блокирует тренера в зале')
t += AUTH_FAIL_WINDOW_MS + 1
ok(lim.check('ivan', HALL).ok, 'после окна снова можно')

console.log('success resets')
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_LOGIN - 1; i++) lim.recordOutcome('petr', HALL, 401)
lim.recordOutcome('petr', HALL, 200)
lim.recordOutcome('petr', HALL, 401)
ok(lim.check('petr', HALL).ok, 'успешный вход сбрасывает счётчик')

console.log('only credential failures count')
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_LOGIN * 2; i++) lim.recordOutcome('anna', HALL, 503)
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_LOGIN * 2; i++) lim.recordOutcome('anna', HALL, 403)
ok(lim.check('anna', HALL).ok, 'сбой облака (503) и блок (403) не считаются')

console.log('per ip ceiling')
const spray = createAuthFailLimiter({ now: () => t })
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_IP; i++) spray.recordOutcome(`u${i}`, '6.6.6.6', 401)
ok(!spray.check('fresh', '6.6.6.6').ok, `перебор по разным логинам с одного IP — стоп после ${AUTH_FAIL_LIMIT_PER_IP}`)
ok(spray.check('fresh', HALL).ok, 'другие IP не затронуты')
ok(AUTH_FAIL_LIMIT_PER_IP >= 50, 'потолок IP высокий — зал за NAT не упирается')

console.log('ip')
ok(clientIpFromHeaders({ 'x-forwarded-for': '1.2.3.4, 10.0.0.2' }) === '1.2.3.4', 'x-forwarded-for — первый адрес')
ok(clientIpFromHeaders({ 'x-real-ip': '7.7.7.7' }) === '7.7.7.7', 'x-real-ip')
ok(clientIpFromHeaders({}) === 'unknown', 'без заголовков — unknown')
ok(/Подождите \d+ мин/.test(authRateLimitedMessageRu(61)), 'сообщение на русском с минутами')

console.log('wiring')
const root = fileURLToPath(new URL('..', import.meta.url))
const signIn = readFileSync(`${root}api/auth-sign-in.js`, 'utf8')
const v1 = readFileSync(`${root}api/_lib/authV1Handler.js`, 'utf8')
ok(/authFailLimiter\.check/.test(signIn) && /authFailLimiter\.recordOutcome/.test(signIn), 'auth-sign-in под лимитом')
ok(/authFailLimiter\.check/.test(v1) && /authFailLimiter\.recordOutcome/.test(v1), '/auth/v1/token (password) под лимитом')
const client = readFileSync(`${root}src/lib/authSignInService.js`, 'utf8')
ok(/status === 429/.test(client) && /rateLimitErr \?\? e/.test(client), 'тренер видит «подождите», а не «неверный пароль»')

if (failed) {
  console.error(`\nverify-auth-rate-limit: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-auth-rate-limit: ok')
