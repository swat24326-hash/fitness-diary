/**
 * Напоминания тренеру из Ежедневника: окно 15 минут, текст, план (тумблер устройства, связанная тренировка,
 * без дублей), запрос настройки, отправка с журналом и удалением протухших подписок.
 * node scripts/verify-schedule-reminders.mjs
 */
import webpush from 'web-push'
import {
  buildScheduleReminderPayload,
  isScheduleReminderDue,
  normalizeSchedulePrefsPayload,
  planScheduleReminders,
  scheduleReminderKey,
} from '../api/_lib/trainerSchedule/scheduleReminderCore.js'
import { runScheduleReminders } from '../api/_lib/trainerSchedule/scheduleReminderJob.js'
import { pushUrlForApp } from '../src/lib/push/pushTargetUrlCore.js'

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
const TODAY = '2026-10-15'

// --- Окно ---
ok(isScheduleReminderDue(H(10), H(9, 45)), 'ровно за 15 минут — шлём')
ok(isScheduleReminderDue(H(10), H(9, 59)), 'за минуту — ещё шлём (cron опоздал)')
ok(!isScheduleReminderDue(H(10), H(9, 44)), 'за 16 минут — рано')
ok(!isScheduleReminderDue(H(10), H(10)), 'уже началась — не шлём')
ok(!isScheduleReminderDue(H(10), H(10, 5)), 'прошла — не шлём')

// --- Текст ---
const withClients = { id: 'e1', start_minutes: H(10), client_ids: ['c1', 'c2'], kind: null, title: '' }
const p1 = buildScheduleReminderPayload({ entry: withClients, nowMinutes: H(9, 48), clientNameById: { c1: 'Анна', c2: 'Олег' } })
ok(p1.title === 'Через 12 мин · 10:00', `заголовок: время и сколько осталось (${p1.title})`)
ok(p1.body === 'Тренировка: Анна, Олег', `текст: категория и клиенты (${p1.body})`)
ok(p1.tag === 'schedule-reminder-e1' && p1.url === '/trainer/calendar', 'тег по записи, ссылка в Ежедневник')
ok(pushUrlForApp(p1.url, 'coach') === '/coach/', 'на телефоне открывается Ежедневник приложения тренера')
const note = buildScheduleReminderPayload({ entry: { id: 'e2', start_minutes: H(13, 30), client_ids: [], kind: 'work', title: 'Планёрка' }, nowMinutes: H(13, 15) })
ok(note.body === 'Работа: Планёрка' && note.title.endsWith('13:30'), 'заметка: категория и заголовок')
const empty = buildScheduleReminderPayload({ entry: { id: 'e3', start_minutes: H(8), client_ids: [], title: '' }, nowMinutes: H(7, 50) })
ok(empty.body === 'Личное: Заметка', 'пустая заметка — «Личное: Заметка»')

// --- План ---
const entries = [
  { id: 'a', trainer_id: 't1', day_date: TODAY, start_minutes: H(10), client_ids: [], title: 'A' },
  { id: 'b', trainer_id: 't1', day_date: TODAY, start_minutes: H(10), client_ids: [], title: 'B', linked_training_id: 'tr1' },
  { id: 'c', trainer_id: 't2', day_date: TODAY, start_minutes: H(10), client_ids: [], title: 'C' },
  { id: 'd', trainer_id: 't3', day_date: TODAY, start_minutes: H(10), client_ids: [], title: 'D' },
  { id: 'e', trainer_id: 't1', day_date: TODAY, start_minutes: H(11), client_ids: [], title: 'E' },
  { id: 'f', trainer_id: 't1', day_date: TODAY, start_minutes: H(9, 55), client_ids: [], title: 'F' },
]
const subscriptions = [
  { id: 's1', user_id: 't1', app: 'staff', schedule_reminders: true },
  { id: 's2', user_id: 't1', app: 'coach' },
  { id: 's3', user_id: 't2', app: 'staff', schedule_reminders: false },
]
const plan = planScheduleReminders({
  today: TODAY,
  nowMinutes: H(9, 50),
  entries,
  subscriptions,
  sentKeys: new Set([scheduleReminderKey('f', TODAY, H(9, 55))]),
})
ok(plan.length === 1 && plan[0].entryId === 'a', 'шлём только A: B стала тренировкой, C выключил, у D нет подписки, E рано, F уже ушла')
ok(plan[0]?.rows.length === 2, 'на оба устройства тренера (планшет и телефон)')
ok(
  planScheduleReminders({ today: TODAY, nowMinutes: H(9, 50), entries: [{ ...entries[0], day_date: '2026-10-16' }], subscriptions, sentKeys: new Set() }).length === 0,
  'запись другого дня не напоминаем',
)

// --- Запрос настройки ---
ok(!normalizeSchedulePrefsPayload({}).ok, 'без endpoint — ошибка')
ok(normalizeSchedulePrefsPayload({ endpoint: 'https://x' }).scheduleReminders === null, 'без флага — чтение')
ok(normalizeSchedulePrefsPayload({ endpoint: 'https://x', schedule_reminders: false }).scheduleReminders === false, 'false — выключить')
ok(normalizeSchedulePrefsPayload({ endpoint: 'https://x', schedule_reminders: 'no' }).scheduleReminders === null, 'не boolean — не запись')

// --- Отправка (фейковая БД) ---
function fakeDb(tables) {
  const match = (row, f) => {
    if (f.op === 'eq') return String(row[f.col]) === String(f.val)
    if (f.op === 'gt') return row[f.col] > f.val
    if (f.op === 'lte') return row[f.col] <= f.val
    if (f.op === 'lt') return row[f.col] < f.val
    if (f.op === 'is') return (row[f.col] ?? null) === f.val
    if (f.op === 'in') return f.val.map(String).includes(String(row[f.col]))
    return true
  }
  return {
    from(table) {
      const q = { op: 'select', filters: [], payload: null, opts: null }
      const api = {
        select: () => api,
        update: (p) => Object.assign(q, { op: 'update', payload: p }) && api,
        upsert: (p, o) => Object.assign(q, { op: 'upsert', payload: p, opts: o }) && api,
        delete: () => Object.assign(q, { op: 'delete' }) && api,
        then(resolve) {
          const all = tables[table] ?? (tables[table] = [])
          const hit = all.filter((r) => q.filters.every((f) => match(r, f)))
          if (q.op === 'delete') tables[table] = all.filter((r) => !hit.includes(r))
          if (q.op === 'upsert') {
            const keys = q.opts.onConflict.split(',')
            if (all.some((r) => keys.every((k) => String(r[k]) === String(q.payload[k])))) return resolve({ data: [], error: null })
            all.push({ ...q.payload })
            return resolve({ data: [q.payload], error: null })
          }
          return resolve({ data: hit, error: null })
        },
      }
      for (const op of ['eq', 'gt', 'lte', 'lt', 'is', 'in']) api[op] = (col, val) => (q.filters.push({ op, col, val }), api)
      return api
    },
  }
}

const vapid = webpush.generateVAPIDKeys()
process.env.VAPID_PUBLIC_KEY = vapid.publicKey
process.env.VAPID_PRIVATE_KEY = vapid.privateKey

const now = new Date('2026-10-15T06:50:00Z') // 09:50 по Москве
const tables = {
  trainer_schedule_entries: entries.map((e) => ({ kind: null, linked_training_id: null, ...e })),
  user_push_subscriptions: [
    { id: 's1', user_id: 't1', endpoint: 'https://a', app: 'staff', schedule_reminders: true },
    { id: 's2', user_id: 't1', endpoint: 'https://b', app: 'coach', schedule_reminders: true },
    { id: 's3', user_id: 't2', endpoint: 'https://c', app: 'staff', schedule_reminders: false },
  ],
  trainer_schedule_reminder_log: [{ entry_id: 'f', day_date: TODAY, start_minutes: H(9, 55) }],
  clients: [],
}
const sentTo = []
const send = async (row) => (sentTo.push(row.id), row.id === 's2' ? { ok: false, expired: true } : { ok: true })
const dry = await runScheduleReminders({ db: fakeDb(tables), now, send, dryRun: true })
ok(dry.dry_run && dry.planned === 1 && sentTo.length === 0, 'dry-run считает, но не шлёт')
const r1 = await runScheduleReminders({ db: fakeDb(tables), now, send })
ok(r1.sent === 1 && r1.expired === 1, `отправлено одно напоминание, протухший телефон снят (${JSON.stringify(r1)})`)
ok(!tables.user_push_subscriptions.some((s) => s.id === 's2'), 'протухшая подписка удалена')
ok(tables.trainer_schedule_reminder_log.some((r) => r.entry_id === 'a'), 'слот записан в журнал')
const r2 = await runScheduleReminders({ db: fakeDb(tables), now, send })
ok(r2.planned === 0 && sentTo.length === 2, 'повторный запуск cron не дублирует')

const failSend = async () => ({ ok: false })
const t2 = { ...tables, trainer_schedule_reminder_log: [], user_push_subscriptions: [{ id: 's1', user_id: 't1', endpoint: 'https://a', app: 'staff', schedule_reminders: true }] }
const r3 = await runScheduleReminders({ db: fakeDb(t2), now, send: failSend })
ok(r3.planned === 2 && r3.failed === 2 && !t2.trainer_schedule_reminder_log.length, 'не дошло — слоты освобождены, следующий запуск попробует')

const missing = {
  from: () => {
    const api = new Proxy({}, { get: (_, k) => (k === 'then' ? (res) => res({ data: null, error: { message: 'column "schedule_reminders" does not exist' } }) : () => api) })
    return api
  },
}
const r4 = await runScheduleReminders({ db: missing, now, send })
ok(r4.skipped === 'migration_pending', 'без миграции — тихо пропускаем')

if (failed) {
  console.error(`\nverify-schedule-reminders: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-schedule-reminders: OK')
