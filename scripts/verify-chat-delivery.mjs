/**
 * Доставка переписки: повтор отправки без дубля, «прочитано» не съедает непоказанное, просмотр админа
 * не гасит непрочитанное, push не уходит заблокированному сотруднику. Счётчики ведёт триггер базы
 * (миграция 20261016120000_chat_atomic_counters.sql) — здесь проверяем, что сервер их больше не пишет сам.
 * node scripts/verify-chat-delivery.mjs
 */
import { clientChatAttention, isStaffChatUnread } from '../src/lib/chat/chatAccessCore.js'
import {
  CHAT_SEND_LIMIT_RU,
  CHAT_SEND_PER_MINUTE,
  activeChatRecipientIds,
  chatReadCutoff,
  chatSendWindowStart,
  isChatSendLimited,
  isUniqueViolation,
  mergeChatThreads,
  nextChatOutgoingId,
  normalizeClientMsgId,
  staffMarksChatRead,
} from '../src/lib/chat/chatDeliveryCore.js'

const key = Buffer.alloc(65, 7)
key[0] = 0x04
process.env.VAPID_PUBLIC_KEY = key.toString('base64url')
process.env.VAPID_PRIVATE_KEY = 'x'.repeat(43)

const { openChatThread, sendChatMessage } = await import('../api/_lib/chat/chatConversation.js')
const { sendChatPush } = await import('../api/_lib/chat/chatPushJob.js')
const { insertDmMessage, markDmRead } = await import('../api/_lib/chat/staffDmStore.js')
const { CHAT_LIST_LIMIT, loadStaffThreads } = await import('../api/_lib/chat/chatStore.js')
const { isLinkedPairIds } = await import('../api/_lib/chat/linkedStaffStore.js')

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

// --- Чистые правила ---
const ID = '0f8b5c2e-3d4a-4b6c-9e1f-2a3b4c5d6e7f'
ok(normalizeClientMsgId(ID.toUpperCase()) === ID, 'номер сообщения — uuid в нижнем регистре')
ok(normalizeClientMsgId('abc') === null && normalizeClientMsgId(undefined) === null, 'не uuid — без номера')

const a = nextChatOutgoingId(null, 'chat-1', { body: 'Привет' })
ok(normalizeClientMsgId(a.id) === a.id, 'новый номер — uuid')
ok(nextChatOutgoingId(a, 'chat-1', { body: 'Привет' }).id === a.id, 'повтор того же текста после ошибки — тот же номер')
ok(nextChatOutgoingId(a, 'chat-1', { body: 'Привет!' }).id !== a.id, 'другой текст — новый номер')
ok(nextChatOutgoingId(a, 'chat-2', { body: 'Привет' }).id !== a.id, 'другой диалог — новый номер')
const s = nextChatOutgoingId(null, 'chat-1', { sticker: 'record' })
ok(nextChatOutgoingId(s, 'chat-1', { sticker: 'record' }).id === s.id && nextChatOutgoingId(s, 'chat-1', { sticker: 'fire' }).id !== s.id, 'стикер: повтор — тот же, другой — новый')

ok(chatReadCutoff('2026-10-12T10:00:00.123Z') === '2026-10-12T10:00:00.124Z', 'граница «прочитано» — на 1 мс позже показанного')
ok(chatReadCutoff(null) === null && chatReadCutoff('нет') === null, 'нет показанных сообщений — не помечаем')
ok(!staffMarksChatRead('admin') && staffMarksChatRead('trainer') && staffMarksChatRead('sales') && staffMarksChatRead('supervisor'), 'просмотр главного админа не ставит «прочитано»')
ok(isUniqueViolation({ code: '23505' }) && !isUniqueViolation({ code: '23503' }), 'конфликт уникальности распознаётся')

const users = [{ id: 'u1', is_active: true }, { id: 'u2', is_active: false }, { id: 'u3' }]
ok(
  JSON.stringify(activeChatRecipientIds(['u1', 'u2', 'u3', 'u1', 'u9'], users, 'u3')) === JSON.stringify(['u1']),
  'push: без заблокированного, без автора, без дублей и неизвестных',
)

const T = (id, at, extra = {}) => ({ id, last_message_at: at, ...extra })
const merged = mergeChatThreads([T('a', '2026-10-12T10:00:00Z'), T('b', '2026-10-11T10:00:00Z')], [T('c', '2026-01-01T00:00:00Z'), T('a', '2026-10-12T10:00:00Z')])
ok(merged.map((t) => t.id).join() === 'a,b,c', 'список: последние + старые непрочитанные, без повторов, новые сверху')

ok(chatSendWindowStart(Date.parse('2026-10-12T10:01:00Z')) === '2026-10-12T10:00:00.000Z', 'окно лимита отправки — последняя минута')
ok(!isChatSendLimited(CHAT_SEND_PER_MINUTE - 1) && isChatSendLimited(CHAT_SEND_PER_MINUTE), `лимит: ${CHAT_SEND_PER_MINUTE}-е сообщение за минуту — уже нельзя`)

const unreadT = (kind) => ({ kind, last_author: 'staff', last_message_at: '2026-10-12T10:00:00Z', client_read_at: null })
ok(clientChatAttention({ trainer_id: 'u1' }, [unreadT('trainer'), unreadT('sales')]) === 2, 'конверт клиента: все непрочитанные видимые диалоги')
ok(clientChatAttention({ trainer_id: null }, [unreadT('trainer'), unreadT('sales')]) === 1, 'тренера сняли — старый диалог с тренером не висит на конверте')
const staffUnread = { last_author: 'client', last_message_at: '2026-10-12T10:00:00Z', staff_read_at: null }
ok(isStaffChatUnread(staffUnread, { archived_at: null }) && !isStaffChatUnread(staffUnread, { archived_at: '2026-10-01' }), 'клиент в архиве — не «ждёт ответа» у сотрудника')

// --- Сервер на фейковой базе ---
function fakeDb(tables, log = [], clock = (n) => new Date(Date.UTC(2026, 9, 12, 10, 0, n)).toISOString()) {
  const match = (row, f) => {
    const v = row[f.col]
    if (f.op === 'eq') return String(v) === String(f.val)
    if (f.op === 'in') return f.val.map(String).includes(String(v))
    if (f.op === 'lt') return v != null && String(v) < String(f.val)
    if (f.op === 'gte') return v != null && String(v) >= String(f.val)
    if (f.op === 'gt') return v != null && Number(v) > Number(f.val)
    if (f.op === 'is') return (v ?? null) === f.val
    return true
  }
  return {
    from(table) {
      const q = { op: 'select', filters: [], payload: null, single: false }
      const api = {
        select: () => api,
        insert: (p) => ((q.op = 'insert'), (q.payload = p), api),
        update: (p) => ((q.op = 'update'), (q.payload = p), api),
        delete: () => ((q.op = 'delete'), api),
        order: (col, o) => ((q.order = { col, asc: o?.ascending !== false }), api),
        limit: (n) => ((q.limit = n), api),
        not: () => api,
        single: () => ((q.single = true), api),
        maybeSingle: () => ((q.single = true), api),
        then(resolve, reject) {
          log.push({ table, op: q.op, payload: q.payload })
          const all = tables[table] ?? (tables[table] = [])
          if (q.op === 'insert') {
            const dup = q.payload.client_msg_id && all.some((r) => r.thread_id === q.payload.thread_id && r.client_msg_id === q.payload.client_msg_id)
            if (dup) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } }).then(resolve, reject)
            const row = { id: `m${all.length + 1}`, created_at: clock(all.length), ...q.payload }
            all.push(row)
            return Promise.resolve({ data: row, error: null }).then(resolve, reject)
          }
          const hit = all.filter((r) => q.filters.every((f) => match(r, f)))
          if (q.order) hit.sort((x, y) => (q.order.asc ? 1 : -1) * String(x[q.order.col]).localeCompare(String(y[q.order.col])))
          if (q.op === 'update') hit.forEach((r) => Object.assign(r, q.payload))
          if (q.op === 'delete') tables[table] = all.filter((r) => !hit.includes(r))
          const cut = q.limit != null ? hit.slice(0, q.limit) : hit
          const data = q.single ? (cut[0] ?? null) : cut
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      for (const op of ['eq', 'in', 'lt', 'gte', 'gt', 'is']) api[op] = (col, val) => (q.filters.push({ op, col, val }), api)
      return api
    },
  }
}

const client = { id: 'cl-1', name: 'Мария', club_id: 'club-1', trainer_id: 'u-trainer' }
const chatTables = {
  chat_threads: [{ id: 't1', client_id: 'cl-1', kind: 'trainer', club_id: 'club-1', staff_unread: 0, client_unread: 0 }],
  chat_messages: [],
  users: [{ id: 'u-trainer', name: 'Анна', is_active: true }],
}
const log = []
const db = fakeDb(chatTables, log)
const first = await sendChatMessage(db, { client, kind: 'trainer', side: 'client', body: 'Можно перенести?', clientMsgId: ID })
const again = await sendChatMessage(db, { client, kind: 'trainer', side: 'client', body: 'Можно перенести?', clientMsgId: ID })
ok(first.status === 200 && again.status === 200 && first.body.message.id === again.body.message.id, 'повтор с тем же номером — то же сообщение')
ok(chatTables.chat_messages.length === 1, 'дубль в базу не записан')
ok(!log.some((l) => l.table === 'chat_threads' && l.op === 'update'), 'счётчики диалога сервер сам не пишет — это делает триггер базы')
await sendChatMessage(db, { client, kind: 'trainer', side: 'client', body: 'Без номера' })
ok(chatTables.chat_messages.length === 2, 'старое приложение без номера — сообщение всё равно сохраняется')

// «Прочитано»: триггер поставил last_message_at новее показанного → не помечаем.
const thread = chatTables.chat_threads[0]
Object.assign(thread, { staff_unread: 2, last_author: 'client', last_message_at: '2026-10-12T10:05:00.000Z', staff_read_at: null })
const asAdmin = await openChatThread(db, { client, kind: 'trainer', side: 'staff', markRead: false })
ok(!asAdmin.marked_read && thread.staff_unread === 2, 'админ открыл диалог — у тренера непрочитанное осталось')
const raced = await openChatThread(db, { client, kind: 'trainer', side: 'staff' })
ok(!raced.marked_read && thread.staff_unread === 2, 'пришло сообщение новее показанных — «прочитано» не ставим')
thread.last_message_at = chatTables.chat_messages.at(-1).created_at
const read = await openChatThread(db, { client, kind: 'trainer', side: 'staff' })
ok(read.marked_read && thread.staff_unread === 0, 'тренер открыл, новых нет — прочитано')

// Личные сообщения сотрудников — тот же контракт.
const dmTables = { staff_dm_threads: [{ id: 'd1', user_lo: 'u1', user_hi: 'u2', lo_unread: 1, last_message_at: '2026-10-12T11:00:00.000Z' }], staff_dm_messages: [] }
const dmDb = fakeDb(dmTables)
const d1 = await insertDmMessage(dmDb, dmTables.staff_dm_threads[0], { authorId: 'u1', body: 'Привет', clientMsgId: ID })
const d2 = await insertDmMessage(dmDb, dmTables.staff_dm_threads[0], { authorId: 'u1', body: 'Привет', clientMsgId: ID })
ok(!d1.duplicate && d2.duplicate && d1.message.id === d2.message.id && dmTables.staff_dm_messages.length === 1, 'личные: повтор — без дубля')
ok(!(await markDmRead(dmDb, dmTables.staff_dm_threads[0], 'lo', '2026-10-12T10:59:00.000Z')), 'личные: есть непоказанное — не помечаем')
ok(await markDmRead(dmDb, dmTables.staff_dm_threads[0], 'lo', '2026-10-12T11:00:00.000Z') && dmTables.staff_dm_threads[0].lo_unread === 0, 'личные: всё показано — прочитано')

// Лимит частоты: залипшая кнопка не зальёт диалог; повтор уже отправленного лимит не трогает.
const rateTables = { chat_threads: [{ id: 't9', client_id: 'cl-1', kind: 'trainer', club_id: 'club-1' }], chat_messages: [], users: chatTables.users }
const rateDb = fakeDb(rateTables, [], (n) => new Date(Date.now() - 1000 + n).toISOString())
let lastOk = null
for (let i = 0; i < CHAT_SEND_PER_MINUTE; i += 1) lastOk = await sendChatMessage(rateDb, { client, kind: 'trainer', side: 'client', body: `№${i}`, clientMsgId: nextChatOutgoingId(null, 'k', { body: String(i) }).id })
const over = await sendChatMessage(rateDb, { client, kind: 'trainer', side: 'client', body: 'ещё' })
ok(lastOk.status === 200 && over.status === 429 && over.body.error === CHAT_SEND_LIMIT_RU, `лимит: ${CHAT_SEND_PER_MINUTE + 1}-е за минуту — 429 с понятным текстом`)
const retryId = rateTables.chat_messages[0].client_msg_id
const retry = await sendChatMessage(rateDb, { client, kind: 'trainer', side: 'client', body: '№0', clientMsgId: retryId })
ok(retry.status === 200 && rateTables.chat_messages.length === CHAT_SEND_PER_MINUTE, 'лимит: повтор отправленного — прежнее сообщение, не 429')
const staffSide = await sendChatMessage(rateDb, { client, kind: 'trainer', side: 'staff', userId: 'u-trainer', body: 'Отвечаю' })
ok(staffSide.status === 200, 'лимит считается по автору: ответ тренера проходит')

// Список сотрудника: старый непрочитанный диалог за пределами последних 100 не теряется.
const many = Array.from({ length: CHAT_LIST_LIMIT + 5 }, (_, i) => ({
  id: `th${i}`,
  club_id: 'club-1',
  kind: 'sales',
  client_id: `c${i}`,
  last_message_at: new Date(Date.UTC(2026, 9, 12) - i * 60_000).toISOString(),
  staff_unread: i === CHAT_LIST_LIMIT + 4 ? 1 : 0,
}))
const listed = await loadStaffThreads(fakeDb({ chat_threads: many }), { role: 'sales', clubId: 'club-1', kinds: ['sales'] })
ok(listed.length === CHAT_LIST_LIMIT + 1 && listed.some((t) => t.id === `th${CHAT_LIST_LIMIT + 4}`), 'список: 100 последних + старый непрочитанный')

// Связанные учётки тренер + управляющий — один человек.
const linkDb = fakeDb({
  users: [
    { id: 'tr', role: 'trainer', club_id: 'club-1', is_active: true, linked_user_id: 'sup' },
    { id: 'sup', role: 'supervisor', club_id: 'club-1', is_active: true, linked_user_id: 'tr' },
    { id: 'other', role: 'trainer', club_id: 'club-1', is_active: true },
  ],
})
ok(await isLinkedPairIds(linkDb, 'sup', 'tr'), 'связанная пара распознаётся — личка между ними запрещена')
ok(!(await isLinkedPairIds(linkDb, 'sup', 'other')), 'обычный коллега — писать можно')

// Push: заблокированный тренер не получает сообщения клиента.
const pushTables = {
  users: [{ id: 'u-trainer', is_active: false }],
  user_push_subscriptions: [{ id: 's1', user_id: 'u-trainer', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', app: 'staff' }],
}
const sent = []
const send = async (row) => (sent.push(row.id), { ok: true })
const blocked = await sendChatPush(fakeDb(pushTables), { kind: 'trainer', authorSide: 'client', client, body: 'Привет' }, send)
ok(blocked.sent === 0 && !sent.length, 'тренер заблокирован — push с текстом клиента не уходит')
pushTables.users[0].is_active = true
const active = await sendChatPush(fakeDb(pushTables), { kind: 'trainer', authorSide: 'client', client, body: 'Привет' }, send)
ok(active.sent === 1 && sent[0] === 's1', 'активный тренер — push ушёл')

if (failed) {
  console.error(`\nverify-chat-delivery: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-chat-delivery: OK')
