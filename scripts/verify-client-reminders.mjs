/**
 * Приложение клиента, фаза Б: напоминание о завтрашней тренировке — окно 19:00, тихие часы, текст,
 * выбор слотов, без дублей, протухшие подписки, допустимые push-службы, карточка в /me.
 * node scripts/verify-client-reminders.mjs
 */
import {
  buildClientReminderBody,
  isClientQuietMinute,
  isClientReminderWindow,
  planClientReminders,
  trainerNameInstrumental,
} from '../api/_lib/clientPortal/clientReminderCore.js'
import { isAllowedPushEndpoint, normalizeClientPushSubscribe } from '../api/_lib/clientPortal/clientPushCore.js'
import { runClientReminders } from '../api/_lib/clientPortal/clientReminderJob.js'
import { clientPushMode } from '../src/lib/client/clientPushModeCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const H = (h, m = 0) => h * 60 + m

// --- Окно и тихие часы ---
ok(!isClientReminderWindow(H(18, 59)), '18:59 — ещё рано')
ok(isClientReminderWindow(H(19)), '19:00 — отправляем')
ok(isClientReminderWindow(H(21, 45)), '21:45 — cron опоздал, догоняем')
ok(!isClientReminderWindow(H(22)), '22:00 — тихие часы, не шлём')
ok(isClientQuietMinute(H(23)) && isClientQuietMinute(H(3)) && isClientQuietMinute(H(8, 59)), 'тихие часы 22:00–9:00')
ok(!isClientQuietMinute(H(9)) && !isClientQuietMinute(H(21, 59)), '9:00 и 21:59 — не тихие')

// --- Имя тренера и текст ---
const inst = {
  Анна: 'Анной',
  Саша: 'Сашей',
  Ольга: 'Ольгой',
  Мария: 'Марией',
  Наталья: 'Натальей',
  Сергей: 'Сергеем',
  Дмитрий: 'Дмитрием',
  Игорь: 'Игорем',
  Иван: 'Иваном',
  Илья: 'Ильёй',
  Любовь: 'Любовью',
}
for (const [name, want] of Object.entries(inst)) ok(trainerNameInstrumental(name) === want, `${name} → с ${want}`)
ok(trainerNameInstrumental('Анна Петрова') === 'Анной', 'берём только имя')
ok(trainerNameInstrumental('Anna') === null && trainerNameInstrumental('Нико') === null, 'не склоняем непонятное')
ok(buildClientReminderBody({ startMinutes: H(18), trainerName: 'Анна' }) === 'Завтра в 18:00 — тренировка с Анной', 'текст владельца')
ok(buildClientReminderBody({ startMinutes: H(7, 30), trainerName: 'Нико' }) === 'Завтра в 07:30 — тренировка, тренер Нико', 'без склонения — «тренер Нико»')
ok(buildClientReminderBody({ startMinutes: H(9), trainerName: '' }) === 'Завтра в 09:00 — тренировка', 'без тренера — только время')

// --- План ---
const TOMORROW = '2026-10-08'
const sub = (id, client) => ({ id, client_id: client, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: 'p', auth: 'a' })
const plan = planClientReminders({
  tomorrow: TOMORROW,
  entries: [
    { day_date: TOMORROW, start_minutes: H(18), trainer_id: 't1', client_ids: ['c1', 'c2'], title: 'секрет тренера' },
    { day_date: TOMORROW, start_minutes: H(18), trainer_id: 't1', client_ids: ['c1'] },
    { day_date: TOMORROW, start_minutes: H(10), trainer_id: 't1', client_ids: ['c3'] },
    { day_date: '2026-10-09', start_minutes: H(10), trainer_id: 't1', client_ids: ['c1'] },
    { day_date: TOMORROW, start_minutes: H(12), trainer_id: 't1', client_ids: ['nosub'] },
  ],
  subscriptions: [sub('s1', 'c1'), sub('s1b', 'c1'), sub('s2', 'c2'), sub('s3', 'c3')],
  sentKeys: new Set(['c3|2026-10-08|600']),
  trainerNames: new Map([['t1', 'Анна Иванова']]),
  clubTitles: new Map([['c1', 'FIT-CITY']]),
})
ok(plan.length === 2, 'c1 и c2 в 18:00; дубль слота, послезавтра, уже отправленное и без подписки — мимо')
const p1 = plan.find((p) => p.clientId === 'c1')
ok(p1?.rows.length === 2, 'два телефона клиента — оба получают')
ok(p1?.payload.title === 'FIT-CITY' && p1?.payload.url === '/me', 'заголовок — клуб, клик открывает /me')
ok(p1?.payload.body === 'Завтра в 18:00 — тренировка с Анной', 'тело — время и тренер')
ok(!JSON.stringify(plan).includes('секрет'), 'заметка слота не уходит в push')

// --- Допустимые push-службы ---
ok(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), 'Android / Chrome')
ok(isAllowedPushEndpoint('https://web.push.apple.com/QAbc'), 'iPhone')
ok(!isAllowedPushEndpoint('http://fcm.googleapis.com/x'), 'не https — нет')
ok(!isAllowedPushEndpoint('https://127.0.0.1:8080/api/health'), 'внутренний адрес — нет')
ok(!isAllowedPushEndpoint('https://fcm.googleapis.com.evil.ru/x'), 'похожий домен — нет')
ok(!normalizeClientPushSubscribe({ endpoint: 'https://evil.ru/x', p256dh: 'p', auth: 'a' }).ok, 'чужой endpoint не сохраняем')

// --- Карточка в /me ---
const env = { configured: true, supported: true, ios: false, standalone: false, permission: 'default', subscribed: false }
ok(clientPushMode({ ...env, configured: false }) === 'none', 'сервер без ключей — карточки нет')
ok(clientPushMode({ ...env, ios: true, supported: false }) === 'install_first', 'iPhone в Safari — сначала установить')
ok(clientPushMode({ ...env, ios: true, standalone: true }) === 'off', 'iPhone с «Домой» — кнопка')
ok(clientPushMode(env) === 'off', 'Android — кнопка сразу')
ok(clientPushMode({ ...env, permission: 'granted', subscribed: true }) === 'on', 'включены')
ok(clientPushMode({ ...env, permission: 'denied', subscribed: true }) === 'denied', 'запрет в настройках — подсказка')
ok(clientPushMode({ ...env, supported: false }) === 'none', 'нет PushManager — карточки нет')

// --- Отправка: журнал без дублей, повтор после сбоя, протухшие подписки ---
function fakeDb(tables) {
  const match = (row, filters) => filters.every(([op, col, v]) => {
    if (op === 'eq') return String(row[col]) === String(v)
    if (op === 'in') return v.map(String).includes(String(row[col]))
    if (op === 'lt') return String(row[col]) < String(v)
    return true
  })
  return {
    from(name) {
      const q = { op: 'select', filters: [], payload: null, opts: {} }
      const api = {
        select: () => api,
        eq: (c, v) => (q.filters.push(['eq', c, v]), api),
        in: (c, v) => (q.filters.push(['in', c, v]), api),
        lt: (c, v) => (q.filters.push(['lt', c, v]), api),
        delete: () => ((q.op = 'delete'), api),
        upsert: (payload, opts) => ((q.op = 'upsert'), (q.payload = payload), (q.opts = opts), api),
        then(resolve) {
          const t = (tables[name] ??= [])
          if (q.op === 'delete') {
            const gone = t.filter((r) => match(r, q.filters))
            tables[name] = t.filter((r) => !gone.includes(r))
            return resolve({ data: gone, error: null })
          }
          if (q.op === 'upsert') {
            const keys = q.opts.onConflict.split(',')
            if (t.some((r) => keys.every((k) => String(r[k]) === String(q.payload[k])))) return resolve({ data: [], error: null })
            t.push({ ...q.payload })
            return resolve({ data: [q.payload], error: null })
          }
          return resolve({ data: t.filter((r) => match(r, q.filters)), error: null })
        },
      }
      return api
    },
  }
}

process.env.VAPID_PUBLIC_KEY = 'verify-public'
process.env.VAPID_PRIVATE_KEY = 'verify-private'
const AT_19 = new Date('2026-10-07T16:00:00Z')
const tables = {
  client_push_subscriptions: [
    { ...sub('s1', 'c1'), session_id: 'live' },
    { ...sub('s2', 'c2'), session_id: 'revoked' },
    { ...sub('s3', 'c3'), session_id: 'live3' },
    { ...sub('s4', 'c4'), session_id: 'live4' },
  ],
  client_sessions: [
    { id: 'live', revoked_at: null },
    { id: 'revoked', revoked_at: '2026-10-01T00:00:00Z' },
    { id: 'live3', revoked_at: null },
    { id: 'live4', revoked_at: null },
  ],
  clients: [
    { id: 'c1', club_id: 'k1', archived_at: null },
    { id: 'c2', club_id: 'k1', archived_at: null },
    { id: 'c3', club_id: 'k1', archived_at: null },
    { id: 'c4', club_id: 'k1', archived_at: '2026-10-01' },
  ],
  trainer_schedule_entries: [
    { club_id: 'k1', day_date: TOMORROW, start_minutes: H(18), trainer_id: 't1', client_ids: ['c1', 'c2', 'c3', 'c4'] },
  ],
  client_reminder_log: [{ client_id: 'old', day_date: '2026-08-01', start_minutes: 600 }],
  clubs: [{ id: 'k1', name: 'FIT-CITY' }],
  users: [{ id: 't1', name: 'Анна' }],
}
const sent = []
let c3Fails = true
const send = async (row, payload) => {
  if (row.id === 's3' && c3Fails) return { ok: false, error: 'временный сбой' }
  sent.push({ row: row.id, payload })
  return { ok: true }
}
const db = fakeDb(tables)

ok((await runClientReminders({ db, now: new Date('2026-10-07T15:59:00Z'), send })).skipped === 'window', '18:59 по Москве — ничего не делаем')
ok((await runClientReminders({ db, now: new Date('2026-10-07T19:00:00Z'), send })).skipped === 'window', '22:00 по Москве — тихие часы')

const r1 = await runClientReminders({ db, now: AT_19, send })
ok(r1.sent === 1 && sent.length === 1 && sent[0].row === 's1', 'первый запуск: только c1 (c2 вышел, c3 сбой, c4 в архиве)')
ok(sent[0].payload.body === 'Завтра в 18:00 — тренировка с Анной', 'текст уходит как задумано')
ok(!tables.client_push_subscriptions.some((s) => s.id === 's2'), 'подписка отозванной сессии удалена')
ok(!tables.client_reminder_log.some((r) => r.client_id === 'c3'), 'сбой отправки — слот свободен для повтора')
ok(!tables.client_reminder_log.some((r) => r.client_id === 'old'), 'старый журнал чистится')

c3Fails = false
const r2 = await runClientReminders({ db, now: new Date('2026-10-07T16:15:00Z'), send })
ok(r2.sent === 1 && sent.length === 2 && sent[1].row === 's3', 'второй запуск: c3 догнали, c1 не продублировали')

const r3 = await runClientReminders({ db, now: new Date('2026-10-07T16:30:00Z'), send })
ok(r3.sent === 0 && sent.length === 2, 'третий запуск: дублей нет')

tables.client_reminder_log = []
const expiredSend = async () => ({ ok: false, expired: true })
const r4 = await runClientReminders({ db, now: AT_19, send: expiredSend })
ok(r4.expired === 2 && tables.client_push_subscriptions.every((s) => s.id === 's4'), '404/410 — подписки удалены')

const dry = await runClientReminders({ db: fakeDb(JSON.parse(JSON.stringify({ ...tables, client_push_subscriptions: [{ ...sub('s9', 'c1'), session_id: 'live' }] }))), now: new Date('2026-10-07T09:00:00Z'), dryRun: true })
ok(dry.dry_run && dry.planned === 1, '--dry-run: считает без окна и без отправки')

if (failed) {
  console.error(`\nverify-client-reminders: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-reminders: OK')
