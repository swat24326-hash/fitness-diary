/**
 * Переписка клиента удаляется через 90 дней в архиве; ссылки собеседника — с подтверждением.
 * node scripts/verify-chat-retention.mjs
 */
import { runChatRetention } from '../api/_lib/chat/chatRetentionJob.js'
import { chatLinkCheck, chatLinkNeedsConfirm } from '../src/lib/chat/chatLinkCore.js'
import { CHAT_ARCHIVE_KEEP_DAYS, chatDeleteOnIso, chatRetentionCutoffIso, isChatExpired } from '../src/lib/chat/chatRetentionCore.js'
import { chatStaffReadOnlyRu } from '../src/lib/chat/chatUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const NOW = new Date('2026-10-12T12:00:00Z')
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString()

// --- Правило срока ---
ok(CHAT_ARCHIVE_KEEP_DAYS === 90, 'срок — 90 дней')
ok(chatRetentionCutoffIso(NOW) === daysAgo(90), 'граница — ровно 90 дней назад')
ok(!isChatExpired({ archived_at: null }, NOW), 'не в архиве — не удаляем')
ok(!isChatExpired({ archived_at: daysAgo(89) }, NOW), '89 дней в архиве — ещё хранится')
ok(isChatExpired({ archived_at: daysAgo(91) }, NOW), '91 день в архиве — удаляем')
ok(!isChatExpired({ archived_at: 'мусор' }, NOW), 'битая дата — не удаляем')
ok(chatDeleteOnIso({ archived_at: '2026-10-01T10:00:00Z' }) === '2026-12-30', 'дата удаления = архив + 90 дней')
ok(chatDeleteOnIso({ archived_at: null }) === null, 'не в архиве — даты удаления нет')

// --- Подсказка сотруднику ---
const hint = chatStaffReadOnlyRu({ client: { archived: true, archived_at: '2026-10-01T10:00:00Z' } })
ok(hint.includes('30.12.2026') && hint.includes('удалена'), 'архивный клиент: сотрудник видит дату удаления')
ok(chatStaffReadOnlyRu({ client: { archived: true } }) === 'Клиент в архиве — написать ему нельзя.', 'без даты архива — без даты удаления')
ok(chatStaffReadOnlyRu({ client: { archived: false } }) === 'Эту переписку вы можете только читать.', 'не архив — прежний текст')

// --- Задача удаления ---
function fakeDb(tables) {
  const match = (row, filters) =>
    filters.every(([op, col, v]) => {
      if (op === 'in') return v.map(String).includes(String(row[col]))
      if (op === 'lt') return row[col] != null && String(row[col]) < String(v)
      return true
    })
  return {
    from(name) {
      const q = { del: false, filters: [] }
      const api = {
        select: () => api,
        in: (c, v) => (q.filters.push(['in', c, v]), api),
        lt: (c, v) => (q.filters.push(['lt', c, v]), api),
        delete: () => ((q.del = true), api),
        then(resolve) {
          if (tables.missing && name === 'chat_threads') {
            return resolve({ data: null, error: { message: 'relation "public.chat_threads" does not exist' } })
          }
          const t = tables[name] ?? []
          const hit = t.filter((r) => match(r, q.filters))
          if (q.del) {
            tables[name] = t.filter((r) => !hit.includes(r))
            if (name === 'chat_threads') {
              const gone = new Set(hit.map((r) => r.id))
              tables.chat_messages = tables.chat_messages.filter((m) => !gone.has(m.thread_id))
            }
          }
          return resolve({ data: hit, error: null })
        },
      }
      return api
    },
  }
}

const tables = {
  clients: [
    { id: 'old', archived_at: daysAgo(120) },
    { id: 'fresh', archived_at: daysAgo(30) },
    { id: 'active', archived_at: null },
  ],
  chat_threads: [
    { id: 't-old-trainer', client_id: 'old' },
    { id: 't-old-sales', client_id: 'old' },
    { id: 't-fresh', client_id: 'fresh' },
    { id: 't-active', client_id: 'active' },
  ],
  chat_messages: [
    { id: 'm1', thread_id: 't-old-trainer' },
    { id: 'm2', thread_id: 't-old-sales' },
    { id: 'm3', thread_id: 't-fresh' },
    { id: 'm4', thread_id: 't-active' },
  ],
}

const dry = await runChatRetention({ db: fakeDb(tables), now: NOW, dryRun: true })
ok(dry.threads === 2 && dry.deleted === 0 && tables.chat_threads.length === 4, 'dry-run считает, но не удаляет')

const res = await runChatRetention({ db: fakeDb(tables), now: NOW })
ok(res.deleted === 2, 'удалены оба диалога клиента, который 120 дней в архиве')
ok(tables.chat_threads.map((t) => t.id).join(',') === 't-fresh,t-active', '30 дней в архиве и активный клиент — переписка на месте')
ok(tables.chat_messages.map((m) => m.id).join(',') === 'm3,m4', 'сообщения удалённых диалогов ушли вместе с ними')
ok((await runChatRetention({ db: fakeDb(tables), now: NOW })).deleted === 0, 'повторный запуск ничего не трогает')
ok((await runChatRetention({ db: fakeDb({ ...tables, missing: true }), now: NOW })).skipped === 'migration_pending', 'до миграции — пропуск без ошибки')

// --- Ссылки ---
const OWN = 'https://app-core.ru'
const shop = chatLinkCheck('https://www.ozon.ru/product/123', OWN)
ok(shop.host === 'www.ozon.ru' && !shop.warnings.length && !shop.internal, 'обычная ссылка: сайт виден, предупреждений нет')
ok(chatLinkNeedsConfirm(shop, false), 'ссылка собеседника — спросить перед открытием')
ok(!chatLinkNeedsConfirm(shop, true), 'своя ссылка — без вопроса')
ok(!chatLinkNeedsConfirm(chatLinkCheck('https://app-core.ru/me', OWN), false), 'ссылка на само приложение — без вопроса')
ok(chatLinkNeedsConfirm(chatLinkCheck('https://app-core.ru.evil.com/me', OWN), false), 'похожий адрес — не «свой»')
ok(chatLinkCheck('https://оzon.ru/x', OWN).warnings.some((w) => w.includes('алфавит')), 'кириллица в латинском адресе — предупреждение')
ok(chatLinkCheck('http://192.168.1.10/pay', OWN).warnings.length === 2, 'IP вместо имени и http — два предупреждения')
const at = chatLinkCheck('https://sberbank.ru@evil.com/login', OWN)
ok(at.host === 'evil.com' && at.warnings.some((w) => w.includes('@')), '«@» в адресе: показываем настоящий сайт')
ok(chatLinkCheck('javascript:alert(1)', OWN) === null, 'не http(s) — не ссылка')
ok(chatLinkCheck('не адрес', OWN) === null, 'мусор — не ссылка')

if (failed) {
  console.error(`\n${failed} проверок не прошли`)
  process.exit(1)
}
console.log('\nverify-chat-retention: всё ок')
