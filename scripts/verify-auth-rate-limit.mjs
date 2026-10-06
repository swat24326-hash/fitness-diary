/**
 * Лимит неудачных входов. На Supabase он встроенный, на своём сервере (C2) — только наш.
 * «Логин + IP» 10, общий на логин 30 (подмена XFF и перебор с многих IP не обходят),
 * знакомый IP не блокируется чужим перебором, потолок IP 100.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  AUTH_FAIL_LIMIT_PER_IP,
  AUTH_FAIL_LIMIT_PER_LOGIN,
  AUTH_FAIL_LIMIT_PER_LOGIN_IP,
  AUTH_FAIL_WINDOW_MS,
  AUTH_KNOWN_IP_TTL_MS,
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
const HALL = '10.0.0.1'
const fail = (lim, login, ip, n) => {
  for (let i = 0; i < n; i++) lim.recordOutcome(login, ip, 401)
}

console.log('per login + ip')
const lim = createAuthFailLimiter({ now: () => t })
fail(lim, 'ivan', HALL, AUTH_FAIL_LIMIT_PER_LOGIN_IP)
const blocked = lim.check('ivan', HALL)
ok(!blocked.ok, `после ${AUTH_FAIL_LIMIT_PER_LOGIN_IP} ошибок с одного места логин там закрыт`)
ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= AUTH_FAIL_WINDOW_MS / 1000, 'Retry-After в пределах окна')
ok(lim.check('IVAN ', HALL).ok === false, 'регистр и пробелы логина не обходят лимит')
ok(lim.check('olga', HALL).ok, 'другой тренер с того же IP зала входит')
ok(lim.check('ivan', '5.5.5.5').ok, 'опечатки в одном месте не закрывают логин везде')
t += AUTH_FAIL_WINDOW_MS + 1
ok(lim.check('ivan', HALL).ok, 'после окна снова можно')

console.log('success resets')
fail(lim, 'petr', HALL, AUTH_FAIL_LIMIT_PER_LOGIN_IP - 1)
lim.recordOutcome('petr', HALL, 200)
lim.recordOutcome('petr', HALL, 401)
ok(lim.check('petr', HALL).ok, 'успешный вход сбрасывает счётчик места')

console.log('only credential failures count')
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_LOGIN * 2; i++) {
  lim.recordOutcome('anna', HALL, 503)
  lim.recordOutcome('anna', HALL, 403)
}
ok(lim.check('anna', HALL).ok, 'сбой облака (503) и блок (403) не считаются')

console.log('xff spoofing (F1)')
const spoof = createAuthFailLimiter({ now: () => t })
const ips = new Set()
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_LOGIN; i++) {
  const ip = clientIpFromHeaders({ 'x-forwarded-for': `9.9.${i}.1, 203.0.113.7` }, '127.0.0.1')
  ips.add(ip)
  spoof.recordOutcome('victim', ip, 401)
}
ok(ips.size === 1 && ips.has('203.0.113.7'), 'левые адреса XFF не создают новые бакеты')
ok(!spoof.check('victim', '203.0.113.7').ok, 'перебор с подменой XFF упирается в «логин + IP»')

console.log('distributed brute force')
const dist = createAuthFailLimiter({ now: () => t })
dist.recordOutcome('admin', HALL, 200)
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_LOGIN; i++) dist.recordOutcome('admin', `198.51.100.${i}`, 401)
ok(!dist.check('admin', '198.51.100.250').ok, `${AUTH_FAIL_LIMIT_PER_LOGIN} ошибок с разных IP — логин закрыт для новых адресов`)
ok(dist.check('admin', HALL).ok, 'знакомый IP (был успешный вход) не заблокирован чужим перебором')
dist.recordOutcome('admin', HALL, 200)
ok(!dist.check('admin', '198.51.100.251').ok, 'успех со знакомого IP не сбрасывает общий счётчик')
fail(dist, 'admin', HALL, AUTH_FAIL_LIMIT_PER_LOGIN_IP)
ok(!dist.check('admin', HALL).ok, 'знакомый IP всё равно под лимитом «логин + IP»')
ok(AUTH_FAIL_LIMIT_PER_LOGIN > AUTH_FAIL_LIMIT_PER_LOGIN_IP, 'общий лимит логина выше лимита места')

console.log('known ip expires')
let k = 1_000_000
const exp = createAuthFailLimiter({ now: () => k, knownIpTtlMs: 1000 })
exp.recordOutcome('olga', HALL, 200)
k += 2000
fail(exp, 'olga', '198.51.100.9', AUTH_FAIL_LIMIT_PER_LOGIN)
ok(!exp.check('olga', HALL).ok, 'просроченное доверие к IP не обходит общий лимит')
ok(AUTH_KNOWN_IP_TTL_MS >= 7 * 24 * 60 * 60 * 1000, 'доверие к IP зала живёт не меньше недели')

console.log('per ip ceiling')
const spray = createAuthFailLimiter({ now: () => t })
for (let i = 0; i < AUTH_FAIL_LIMIT_PER_IP; i++) spray.recordOutcome(`u${i}`, '6.6.6.6', 401)
ok(!spray.check('fresh', '6.6.6.6').ok, `перебор по разным логинам с одного IP — стоп после ${AUTH_FAIL_LIMIT_PER_IP}`)
ok(spray.check('fresh', HALL).ok, 'другие IP не затронуты')
ok(AUTH_FAIL_LIMIT_PER_IP >= 50, 'потолок IP высокий — зал за NAT не упирается')

console.log('ip')
ok(clientIpFromHeaders({ 'x-forwarded-for': '1.2.3.4, 10.0.0.2' }) === '10.0.0.2', 'x-forwarded-for — правый адрес (от прокси)')
ok(clientIpFromHeaders({ 'x-forwarded-for': '1.2.3.4' }, '::ffff:127.0.0.1') === '1.2.3.4', 'от Caddy на localhost — XFF')
ok(clientIpFromHeaders({ 'x-forwarded-for': '1.2.3.4' }, '198.51.100.9') === '198.51.100.9', 'внешний адрес — сокет, XFF игнор')
ok(clientIpFromHeaders({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.5') === '10.0.0.5', 'частная сеть — не прокси, XFF игнор')
ok(clientIpFromHeaders({ 'x-real-ip': '7.7.7.7' }) === '7.7.7.7', 'x-real-ip')
ok(clientIpFromHeaders({}) === 'unknown', 'без заголовков — unknown')
ok(clientIpFromHeaders({}, '127.0.0.1') === '127.0.0.1', 'без заголовков от прокси — адрес сокета')
ok(/Подождите \d+ мин/.test(authRateLimitedMessageRu(61)), 'сообщение на русском с минутами')

console.log('wiring')
const root = fileURLToPath(new URL('..', import.meta.url))
const signIn = readFileSync(`${root}api/auth-sign-in.js`, 'utf8')
const v1 = readFileSync(`${root}api/_lib/authV1Handler.js`, 'utf8')
ok(/authFailLimiter\.check/.test(signIn) && /authFailLimiter\.recordOutcome/.test(signIn), 'auth-sign-in под лимитом')
ok(/authFailLimiter\.check/.test(v1) && /authFailLimiter\.recordOutcome/.test(v1), '/auth/v1/token (password) под лимитом')
for (const [name, src] of [['auth-sign-in', signIn], ['auth/v1', v1]]) {
  ok(/clientIpFromHeaders\(req\.headers, req\.remoteAddress/.test(src), `${name}: IP с учётом адреса сокета`)
}
const host = readFileSync(`${root}server/portableApiHost.js`, 'utf8')
ok(/remoteAddress: req\.socket\?\.remoteAddress/.test(host), 'portable host передаёт адрес сокета')
const caddy = readFileSync(`${root}scripts/r3-https-vm.sh`, 'utf8')
ok(/header_up X-Forwarded-For \{remote_host\}/.test(caddy), 'Caddy перезаписывает X-Forwarded-For')
const client = readFileSync(`${root}src/lib/authSignInService.js`, 'utf8')
ok(/status === 429/.test(client) && /rateLimitErr \?\? e/.test(client), 'тренер видит «подождите», а не «неверный пароль»')

if (failed) {
  console.error(`\nverify-auth-rate-limit: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-auth-rate-limit: ok')
