/**
 * «Ответить» с цитатой: кто в цитате, текст, стикер, мусорный id, исходное не нашлось, свайп влево,
 * догрузка истории до старого исходного (порядок, лимит страниц, пустая страница).
 * node scripts/verify-chat-reply.mjs
 */
import {
  CHAT_REPLY_PREVIEW_MAX,
  CHAT_REPLY_STICKER_RU,
  CHAT_REPLY_SWIPE_PX,
  CHAT_REPLY_YOU_RU,
  buildChatReplyQuote,
  chatReplyQuoteFor,
  chatReplySwipeOffset,
  isChatReplySwipe,
  loadChatHistoryUntil,
  normalizeChatReplyTo,
} from '../src/lib/chat/chatReplyCore.js'
import { buildChatMessageView } from '../src/lib/chat/chatMessageCore.js'
import { buildStaffDmMessageView } from '../src/lib/chat/staffDmAccessCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    console.error(`  ✗ ${msg}`)
    failed++
  }
}

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const TRAINER = '11111111-2222-4333-8444-555555555555'
const PEER = '99999999-2222-4333-8444-555555555555'

console.log('id ответа')
ok(normalizeChatReplyTo(` ${ID.toUpperCase()} `) === ID, 'uuid — обрезан и в нижнем регистре')
ok(normalizeChatReplyTo('') === null && normalizeChatReplyTo(null) === null, 'пусто — без ответа')
ok(normalizeChatReplyTo("1' or 1=1") === null, 'мусор — без ответа, в запрос не идёт')

console.log('кто в цитате')
const names = new Map([[TRAINER, 'Анна']])
const fromClient = { id: ID, body: 'Подойдёт резинка?', created_at: '2026-10-13T10:00:00Z', author_side: 'client', author_user_id: null }
const fromTrainer = { ...fromClient, body: 'Да', author_side: 'staff', author_user_id: TRAINER }
ok(buildChatReplyQuote(buildChatMessageView(fromClient, 'client', names)).who === CHAT_REPLY_YOU_RU, 'клиент цитирует себя — «Вы»')
ok(buildChatReplyQuote(buildChatMessageView(fromTrainer, 'client', names)).who === 'Анна', 'клиент цитирует тренера — имя тренера')
ok(buildChatReplyQuote(buildChatMessageView(fromClient, 'staff', names), 'Иван Петров').who === 'Иван Петров', 'тренер цитирует клиента — имя клиента')
ok(buildChatReplyQuote(buildChatMessageView(fromTrainer, 'staff', names)).who === CHAT_REPLY_YOU_RU, 'тренер цитирует себя — «Вы»')
const dm = { id: ID, body: 'Подменишь?', created_at: '2026-10-13T10:00:00Z', author_user_id: PEER }
ok(buildChatReplyQuote(buildStaffDmMessageView(dm, TRAINER), 'Ольга').who === 'Ольга', 'коллеги: чужое — имя коллеги')
ok(buildChatReplyQuote(buildStaffDmMessageView(dm, PEER), 'Анна').who === CHAT_REPLY_YOU_RU, 'коллеги: своё — «Вы»')

console.log('текст цитаты')
const long = buildChatReplyQuote({ id: ID, mine: true, body: `строка\n${'я'.repeat(300)}` })
ok(long.text.length === CHAT_REPLY_PREVIEW_MAX && long.text.endsWith('…') && !long.text.includes('\n'), 'длинный текст — одна строка с многоточием')
ok(buildChatReplyQuote({ id: ID, mine: false, author_name: 'Анна', body: 'Отличная работа', sticker: 'great' }).text === CHAT_REPLY_STICKER_RU, 'стикер — «Стикер»')
ok(buildChatReplyQuote(null) === null && buildChatReplyQuote({ body: 'x' }) === null, 'нет сообщения — нет цитаты')

console.log('цитата в ленте')
const toView = (m) => buildChatMessageView(m, 'client', names)
const answer = { ...fromTrainer, id: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', reply_to: ID }
const quoted = new Map([[ID, fromClient]])
ok(chatReplyQuoteFor(answer, quoted, toView)?.text === 'Подойдёт резинка?', 'исходное нашлось — цитата с его текстом')
ok(chatReplyQuoteFor(answer, new Map(), toView) === null, 'исходное удалено — ответ без цитаты')
ok(chatReplyQuoteFor(fromClient, quoted, toView) === null, 'не ответ — без цитаты')

console.log('свайп влево')
ok(isChatReplySwipe(-CHAT_REPLY_SWIPE_PX, 5), 'влево на порог — ответить')
ok(!isChatReplySwipe(-CHAT_REPLY_SWIPE_PX + 1, 0), 'чуть не дотянул — нет')
ok(!isChatReplySwipe(CHAT_REPLY_SWIPE_PX * 2, 0), 'вправо — нет')
ok(!isChatReplySwipe(-80, 70), 'наискосок (листал ленту) — нет')
ok(chatReplySwipeOffset(40) === 0 && chatReplySwipeOffset(-30) === -30, 'пузырь едет только влево')
ok(chatReplySwipeOffset(-500) === -CHAT_REPLY_SWIPE_PX * 1.4, 'и не дальше упора')

console.log('цитата старого сообщения — догрузить историю')
const at = (i) => new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString()
const history = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, created_at: at(i) }))
/** Сервер: до before, последние size, по возрастанию. */
const pager = (size) => {
  const calls = []
  const loadOlder = async (before) => {
    calls.push(before)
    const older = history.filter((m) => m.created_at < before)
    return { messages: older.slice(-size), has_more: older.length > size }
  }
  return { calls, loadOlder }
}
const shown = history.slice(-2)
const p1 = pager(3)
const r1 = await loadChatHistoryUntil({ id: 'm2', messages: shown, hasMore: true, loadOlder: p1.loadOlder })
ok(r1.found && p1.calls.length === 2, 'старое на второй странице — догрузили две страницы и нашли')
ok(r1.messages[0].id === 'm2' && r1.messages.length === 8 && r1.hasMore, 'лента без дыр, по порядку, «Раньше» осталось')
ok(r1.messages.every((m, i, a) => !i || a[i - 1].created_at < m.created_at), 'порядок по времени')
const p2 = pager(3)
const r2 = await loadChatHistoryUntil({ id: 'deleted', messages: shown, hasMore: true, loadOlder: p2.loadOlder })
ok(!r2.found && !r2.hasMore && r2.messages.length === 10, 'исходного нет — дошли до начала истории и остановились')
const p3 = pager(1)
const r3 = await loadChatHistoryUntil({ id: 'm0', messages: shown, hasMore: true, loadOlder: p3.loadOlder, maxPages: 3 })
ok(!r3.found && p3.calls.length === 3 && r3.hasMore, 'упёрлись в лимит страниц — не грузим бесконечно, «Раньше» осталось')
const p4 = pager(3)
const r4 = await loadChatHistoryUntil({ id: 'm9', messages: shown, hasMore: true, loadOlder: p4.loadOlder })
ok(r4.found && p4.calls.length === 0, 'уже в ленте — сервер не трогаем')
const r5 = await loadChatHistoryUntil({ id: 'm1', messages: shown, hasMore: true, loadOlder: async () => ({ messages: [], has_more: true }) })
ok(!r5.found && !r5.hasMore, 'сервер вернул пустую страницу при has_more — не зацикливаемся')
ok(!(await loadChatHistoryUntil({ id: 'm1', messages: shown, hasMore: false, loadOlder: p4.loadOlder })).found, 'истории больше нет — не ищем')

if (failed) {
  console.error(`\nverify-chat-reply: ${failed} fail`)
  process.exit(1)
}
console.log('\nverify-chat-reply: OK')
