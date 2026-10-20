/**
 * Клиент: когда стираем кэш на телефоне, а когда только токены.
 * Запуск: node scripts/verify-client-session-clear.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldWipeClientLocalOnRedeem } from '../src/lib/client/clientSessionClearCore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failed += 1
  }
}
function src(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

console.log('правило входа по ссылке')
ok(!shouldWipeClientLocalOnRedeem('c1', 'c1'), 'тот же клиент — кэш не стираем')
ok(shouldWipeClientLocalOnRedeem('c1', 'c2'), 'другой клиент — стираем')
ok(shouldWipeClientLocalOnRedeem(null, 'c1'), 'на телефоне никого не помним — стираем')
ok(shouldWipeClientLocalOnRedeem('c1', null), 'в ссылке нет id — стираем')
ok(!shouldWipeClientLocalOnRedeem(12, '12'), 'число и строка одного id — не стираем')

console.log('wiring')
const session = src('src/lib/client/clientSession.js')
ok(/export function dropClientTokens/.test(session), 'есть мягкий сброс токенов')
ok(/dropClientTokens\(\)/.test(session) && /res\.status === 401/.test(session), '401 — только токены')
ok(/logoutClient[\s\S]*clearClientSession/.test(session), '«Выйти» — полная очистка')
ok(/shouldWipeClientLocalOnRedeem/.test(session) && /redeemClientInvite/.test(session), 'redeem смотрит, тот же ли человек')
const store = src('src/lib/screenCache/screenCacheStore.js')
ok(/app === 'client'/.test(store) && /purgeScreenCache/.test(store), 'старт /me без сессии не стирает весь кэш клиента')

if (failed) {
  console.error(`\nverify-client-session-clear: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-client-session-clear: ok')
