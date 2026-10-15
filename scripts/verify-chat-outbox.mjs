/**
 * Сообщения «ждут сети» (часики, как в Telegram): что копим без сети, когда повторяем,
 * как ждущие встают в ленту; проводка в общем хуке переписки.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CHAT_OUTBOX_PREFIX,
  chatOutboxAdd,
  chatOutboxDrop,
  chatOutboxEligible,
  chatOutboxEntry,
  chatSendRetryable,
  withChatOutbox,
} from '../src/lib/chat/chatOutboxCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')

console.log('Что копим без сети')
ok(chatOutboxEligible({ body: 'Привет' }), 'текст — в очередь')
ok(chatOutboxEligible({ sticker: 'fire' }), 'стикер — в очередь')
ok(!chatOutboxEligible({ audio: 'x', sec: 2 }), 'голосовое — нет')
ok(!chatOutboxEligible({ parts: ['a'], sec: 2 }), 'голосовое кусками — нет')
ok(!chatOutboxEligible({ video: { size: 1 }, sec: 2 }), 'видео — нет')
ok(!chatOutboxEligible({ attach: { data: 'x' }, body: 'подпись' }), 'фото с подписью — нет')
ok(!chatOutboxEligible(null), 'пусто — нет')

console.log('Когда повторяем')
ok(chatSendRetryable(new Error('Failed to fetch')), 'сеть оборвалась (без статуса) — повторить')
ok(chatSendRetryable({ status: 502 }), 'сервер упал — повторить')
ok(chatSendRetryable({ status: 408 }), 'таймаут — повторить')
ok(!chatSendRetryable({ status: 429 }), '«слишком много» — сразу показать')
ok(!chatSendRetryable({ status: 403 }), 'нет доступа — сразу показать')
ok(!chatSendRetryable({ status: 400 }), 'ошибка текста — сразу показать')

console.log('Очередь')
const quote = { id: 'm1', who: 'Вера', text: 'Во сколько?', sticker: null }
const a = chatOutboxEntry({ body: 'В 18', client_msg_id: 'u-1', reply_to: 'm1' }, quote, new Date('2026-10-15T18:00:00Z'))
const b = chatOutboxEntry({ sticker: 'ok', client_msg_id: 'u-2' }, null, new Date('2026-10-15T18:00:05Z'))
ok(a.id === `${CHAT_OUTBOX_PREFIX}u-1`, 'id ждущего — от client_msg_id (повтор не создаст дубль)')
let box = chatOutboxAdd(chatOutboxAdd([], a), b)
ok(box.length === 2 && box[0] === a, 'порядок отправки — как написали')
ok(chatOutboxAdd(box, a) === box, 'повторно то же — без второй копии')
box = chatOutboxDrop(box, a.id)
ok(box.length === 1 && box[0] === b, 'ушло — убрали из очереди')

console.log('Лента')
const feed = [
  { id: 'm1', body: 'Во сколько?', created_at: '2026-10-15T17:59:00Z', side: 'client', mine: false, author_name: '' },
  { id: 'm0', body: 'Добрый', created_at: '2026-10-15T17:58:00Z', side: 'staff', mine: true, author_name: 'Анна' },
]
const shown = withChatOutbox(feed, [a, b], 'staff')
ok(shown.length === 4 && shown[2].id === a.id && shown[3].id === b.id, 'ждущие — в конце ленты по порядку')
ok(shown[2].pending && shown[2].mine && shown[2].body === 'В 18', 'ждущий — свой, с часиками')
ok(shown[2].reply === quote, 'цитата видна и до отправки')
ok(shown[3].sticker === 'ok' && shown[3].body === '', 'стикер ждёт как стикер')
ok(shown[2].side === 'staff' && shown[2].author_name === 'Анна', 'сторона и подпись — как у своих (пачка не рвётся)')
ok(withChatOutbox(feed, [], 'staff') === feed, 'очередь пуста — лента та же')
ok(withChatOutbox(null, [a], 'staff') === null, 'лента ещё грузится — не выдумываем')

console.log('Проводка')
const hook = read('../src/hooks/useChatThread.js')
const box2 = read('../src/hooks/useChatOutbox.js')
const feedJsx = read('../src/components/chat/ChatFeed.jsx')
ok(/chatOutboxEligible\(outgoing\)/.test(hook) && /park\(\)/.test(hook), 'хук: без сети текст — в очередь')
ok(/chatSendRetryable\(e\) && keyRef\.current === forKey/.test(hook), 'хук: оборвалось при отправке — в очередь этого же диалога')
ok(/outboxRef\.current\.list\.length\)\) return park\(\)/.test(hook), 'хук: пока очередь не пуста — новое за ней (порядок)')
ok(/keyRef\.current === forKey\)/.test(box2) && /\[storeKey, key, flush\]/.test(box2), 'очередь: сменили диалог — чужое не отправляем')
ok(/`\$\{cacheKey\}:outbox`/.test(box2), 'очередь телефона — в кэше экранов (стирается при «Выйти» и через 7 дней)')
ok(/addEventListener\('online'/.test(box2), 'очередь: сеть вернулась — уходит сама')
ok(/item\.pending \? press\(item\)|!item\.pending \? press\(item\)/.test(feedJsx), 'лента: на ждущем нет реакций и ответа')
ok(/m\.pending \?/.test(feedJsx) && /Clock/.test(feedJsx), 'лента: часики вместо галочки')

if (failed) {
  console.error(`\nchat outbox verify: ${failed} fail`)
  process.exit(1)
}
console.log('\nchat outbox verify ok')
