/**
 * Кэш экранов приложения клиента и телефона тренера (как в Telegram): ключи, срок 7 дней, лимит записей,
 * обрезка ленты до последних сообщений, стирание при выходе.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CHAT_CACHE_MESSAGES,
  SCREEN_CACHE_MAX_ENTRIES,
  SCREEN_CACHE_TTL_MS,
  chatCacheSnapshot,
  isScreenCacheFresh,
  screenCacheEvictKeys,
  screenCacheKey,
  screenCacheSignature,
} from '../src/lib/screenCache/screenCacheCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const src = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8')

const NOW = Date.parse('2026-10-15T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

console.log('ключи')
ok(screenCacheKey('client', 'chat', 'trainer') === 'client:chat:trainer', 'клиент: диалог')
ok(screenCacheKey('coach', 'contacts') === 'coach:contacts', 'тренер: экран без id')
ok(screenCacheKey('staff', 'chat', 'x') === '', 'планшет зала кэш не получает')
ok(screenCacheKey('coach', '') === '', 'без экрана — без кэша')

console.log('срок')
ok(isScreenCacheFresh({ savedAt: NOW - 6 * DAY }, NOW), '6 дней — показываем')
ok(!isScreenCacheFresh({ savedAt: NOW - 7 * DAY }, NOW), '7 дней — уже нет')
ok(SCREEN_CACHE_TTL_MS === 7 * DAY, 'срок — 7 дней (решение владельца 15.10)')
ok(!isScreenCacheFresh({ savedAt: NOW + 2 * DAY }, NOW), 'дата из будущего (сбитые часы) — не верим')
ok(!isScreenCacheFresh(null, NOW) && !isScreenCacheFresh({}, NOW), 'пустая запись — нет')

console.log('вытеснение')
const many = Array.from({ length: SCREEN_CACHE_MAX_ENTRIES + 3 }, (_, i) => ({ key: `coach:chat:${i}`, savedAt: NOW - i * 1000 }))
const old = { key: 'coach:chats', savedAt: NOW - 8 * DAY }
const drop = screenCacheEvictKeys([...many, old], NOW)
ok(drop.includes('coach:chats'), 'просроченное удаляем')
ok(drop.length === 4 && drop.includes(`coach:chat:${SCREEN_CACHE_MAX_ENTRIES + 2}`), 'сверх лимита — самые давние')
ok(!drop.includes('coach:chat:0'), 'свежие остаются')
ok(screenCacheEvictKeys(many.slice(0, 5), NOW).length === 0, 'в пределах лимита ничего не трогаем')

console.log('лента')
const msgs = Array.from({ length: CHAT_CACHE_MESSAGES + 15 }, (_, i) => ({ id: `m${i}` }))
const snap = chatCacheSnapshot(msgs, false, { voice_ready: true })
ok(snap.messages.length === CHAT_CACHE_MESSAGES && snap.messages.at(-1).id === `m${CHAT_CACHE_MESSAGES + 14}`, 'только последние сообщения')
ok(snap.hasMore === true, 'обрезали — «Раньше» остаётся')
ok(chatCacheSnapshot(msgs.slice(0, 3), false, null).hasMore === false, 'короткая лента без «Раньше»')
ok(chatCacheSnapshot(null, false, null) === null, 'нет ленты — нечего сохранять')
ok(screenCacheSignature(snap) === screenCacheSignature(chatCacheSnapshot(msgs, false, { voice_ready: true })), 'одинаковая лента — тот же отпечаток')
ok(screenCacheSignature(snap) !== screenCacheSignature(chatCacheSnapshot([...msgs, { id: 'new' }], false, null)), 'новое сообщение — другой отпечаток')

console.log('wiring')
const client = src('src/lib/client/clientSession.js')
const coach = src('src/lib/coach/coachSession.js')
ok(/clearScreenCacheApp\('client'\)/.test(client), 'выход клиента стирает кэш')
ok(/clearScreenCacheApp\('coach'\)/.test(coach), 'выход тренера стирает кэш')
ok(/registerScreenCacheGuard\('client', hasClientSession\)/.test(client), 'после выхода клиента кэш не пишется')
ok(/registerScreenCacheGuard\('coach', hasCoachSession\)/.test(coach), 'после выхода тренера кэш не пишется')
const store = src('src/lib/screenCache/screenCacheStore.js')
ok(/'fd-screen-cache'/.test(store) && !/fitness-diary'/.test(store), 'своя база, не база планшета с очередью Sync')
ok(/purgeScreenCache/.test(src('src/pages/client/ClientAppContext.jsx')), 'клиент: просроченное чистится при старте')
ok(/purgeScreenCache/.test(src('src/pages/coach/CoachAppContext.jsx')), 'тренер: просроченное чистится при старте')
ok(!/cache:/.test(src('src/hooks/useStaffChat.js')), 'планшет зала (useStaffChat) без кэша экранов')

if (failed) {
  console.error(`\nverify-screen-cache: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-screen-cache: ok')
