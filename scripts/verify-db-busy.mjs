/**
 * INC-2026-10-13-01: перегрузка базы — «Сервер занят» (503), а не пустые разделы / «не найдено».
 * Сервер: что считается временным сбоем, статус 503, строгий клиент для проверок доступа.
 * Клиент: 502/503/504 откладывают запись без счётчика попыток.
 */
import { DB_BUSY_CODE, DB_BUSY_RU, isTransientDbError, pgErrorForServer, pgErrorPublic } from '../api/_lib/dbErrorPublicCore.js'
import { strictTransientClient } from '../api/_lib/pgRest/transientStrictClient.js'
import { isDeferrablePushFailure, isUnrecoverablePushError } from '../src/lib/syncFlushResult.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

const poolTimeout = new Error('timeout exceeded when trying to connect')

console.log('Временный сбой базы')
ok(isTransientDbError(poolTimeout), 'пул занят (node-pg без кода) — временный')
ok(isTransientDbError({ code: 'ECONNREFUSED', message: 'x' }), 'ECONNREFUSED — временный')
ok(isTransientDbError({ code: '53300', message: 'too many connections' }), '53300 — временный')
ok(isTransientDbError({ code: '57014', message: 'canceling statement' }), '57014 (таймаут запроса) — временный')
ok(isTransientDbError({ code: '57P01', message: 'terminating connection' }), '57P01 — временный')
ok(isTransientDbError({ code: '08006', message: 'connection failure' }), '08006 — временный')
ok(isTransientDbError({ code: DB_BUSY_CODE }), 'уже переведённый DB_BUSY — временный')
ok(!isTransientDbError({ code: '23505', message: 'duplicate key' }), '23505 — не временный')
ok(!isTransientDbError({ code: '42703', message: 'column does not exist' }), '42703 — не временный')
ok(!isTransientDbError(null), 'null — не временный')

console.log('Ответ клиенту')
const pub = pgErrorPublic(poolTimeout)
ok(pub.status === 503 && pub.code === DB_BUSY_CODE && pub.message === DB_BUSY_RU, 'пул занят → 503 «Сервер занят»')
ok(pgErrorPublic({ code: '23505', message: 'dup' }).status !== 503, 'дубль — не 503')
const srv = pgErrorForServer(poolTimeout)
ok(srv.code === DB_BUSY_CODE && isTransientDbError(srv), 'после выхода из pg ошибка остаётся временной')

console.log('Строгий клиент проверок доступа')
function fakeClient(result) {
  const builder = {
    calls: 0,
    eq() {
      this.calls++
      return this
    },
    maybeSingle() {
      return this
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(result).then(onFulfilled, onRejected)
    },
  }
  return { from: () => builder }
}
let threw = null
try {
  await strictTransientClient(fakeClient({ data: null, error: poolTimeout })).from('memberships').eq('id', 'm1').maybeSingle()
} catch (e) {
  threw = e
}
ok(threw === poolTimeout, 'сбой пула → исключение, а не { data: null } («абонемент не найден»)')
const dup = { data: null, error: { code: '23505', message: 'dup' } }
const passed = await strictTransientClient(fakeClient(dup)).from('x').eq('a', 1).eq('b', 2).maybeSingle()
ok(passed === dup, 'обычная ошибка базы возвращается как раньше')
const row = await strictTransientClient(fakeClient({ data: { id: 'm1' }, error: null })).from('x').eq('id', 'm1')
ok(row.data?.id === 'm1', 'успешный ответ не меняется')

console.log('Очередь планшета')
ok(isDeferrablePushFailure(503) && isDeferrablePushFailure(502) && isDeferrablePushFailure(504), '502/503/504 — отложить')
ok(!isDeferrablePushFailure(400) && !isDeferrablePushFailure(403) && !isDeferrablePushFailure(undefined), '400/403/нет статуса — не откладывать')
ok(!isUnrecoverablePushError(503, DB_BUSY_RU), '503 «Сервер занят» не снимает запись')

if (failed) {
  console.error(`\nverify-db-busy: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-db-busy: OK')
