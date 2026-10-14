/**
 * Центр сбоев устройств: сигналы планшета, отчёт на сервере, server_no_pull, push админам.
 * Запуск: node scripts/verify-device-health.mjs
 */
import {
  applyDeviceReport,
  buildDevicePushPayload,
  detectServerNoPull,
  deviceNeedsAttention,
  planDevicePush,
  planDeviceServerUpdate,
  sanitizeDeviceReport,
  toDeviceHealthView,
} from '../api/_lib/deviceHealth/deviceHealthCore.js'
import { runDeviceHealthJob } from '../api/_lib/deviceHealth/deviceHealthJob.js'
import { deviceHealthInstruction, normalizeDeviceHealthCodes } from '../src/lib/deviceHealth/deviceHealthCatalog.js'
import { collectDeviceProblems, nextPullMark } from '../src/lib/deviceHealth/deviceHealthSignalsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log('ok:', msg)
  else {
    console.error('FAIL:', msg)
    failed += 1
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const MIN = 60_000
const H = 60 * MIN
const NOW = Date.parse('2026-10-14T09:00:00Z')
const DAY = 12 * 60 // 12:00 МСК
const NIGHT = 2 * 60

// --- Каталог
ok(eq(normalizeDeviceHealthCodes(['build_stale', 'x', 'db_blocked', 'db_blocked']), ['db_blocked', 'build_stale']), 'коды: только известные, без повторов, по важности')
ok(deviceHealthInstruction(['db_blocked']).includes('перезагрузите планшет'), 'инструкция для db_blocked')

// --- Сигналы планшета
const base = { now: NOW, online: true }
ok(eq(collectDeviceProblems(base), []), 'всё хорошо — пусто')
ok(eq(collectDeviceProblems({ ...base, dbBlocked: true, queue: null }), ['db_blocked']), 'база заблокирована')
ok(
  eq(collectDeviceProblems({ ...base, queue: [{ created_at: NOW - 40 * MIN, retry_count: 0 }] }), []),
  'запись в очереди без попыток отправки — не сбой',
)
ok(
  eq(collectDeviceProblems({ ...base, queue: [{ created_at: NOW - 40 * MIN, retry_count: 2 }] }), ['queue_stuck']),
  'запись висит 40 мин после попыток — queue_stuck',
)
ok(
  eq(collectDeviceProblems({ ...base, queue: [{ created_at: NOW - 10 * MIN, retry_count: 2 }] }), []),
  'свежая запись с попытками — ещё не сбой',
)
ok(
  eq(collectDeviceProblems({ ...base, queue: [{ created_at: NOW - 5 * MIN, retry_count: 1, last_error: '401 Unauthorized' }] }), ['auth_stuck']),
  'ошибка сессии в очереди — auth_stuck (вместо queue_stuck)',
)
ok(
  eq(collectDeviceProblems({ ...base, online: false, queue: [{ created_at: NOW - 3 * H, retry_count: 5 }] }), []),
  'без сети очередь не считается сбоем',
)
ok(eq(collectDeviceProblems({ ...base, pull: { failSince: NOW - 40 * MIN, failCount: 3 } }), ['pull_failing']), 'загрузка падает 40 мин — pull_failing')
ok(eq(collectDeviceProblems({ ...base, pull: { failSince: NOW - 40 * MIN, failCount: 1 } }), []), 'одна неудача — не сбой')
ok(eq(collectDeviceProblems({ ...base, pull: { failSince: NOW - 10 * MIN, failCount: 5 } }), []), 'серия короче 30 мин — не сбой')
ok(eq(collectDeviceProblems({ ...base, buildStaleSince: NOW - 4 * H }), ['build_stale']), 'старая сборка 4 ч — build_stale')
ok(eq(collectDeviceProblems({ ...base, buildStaleSince: NOW - 1 * H }), []), 'старая сборка 1 ч — ещё ждём обновления')

let mark = nextPullMark(null, false, NOW - 50 * MIN)
mark = nextPullMark(mark, false, NOW - 20 * MIN)
ok(mark.failSince === NOW - 50 * MIN && mark.failCount === 2, 'серия неудач: начало и счётчик')
mark = nextPullMark(mark, true, NOW)
ok(mark.failSince == null && mark.failCount === 0 && mark.okAt === NOW, 'успех сбрасывает серию')

// --- Отчёт на сервере
const rep = sanitizeDeviceReport({ problems: ['db_blocked', 'server_no_pull', 'hack'], bundle_id: 'DQmv9keG', queue_count: '7' })
ok(eq(rep.problems, ['db_blocked']), 'планшет не может прислать server_no_pull и чужие коды')
ok(rep.bundle_id === 'DQmv9keG' && rep.queue_count === 7, 'сборка и очередь')
ok(sanitizeDeviceReport({ bundle_id: '<script>' }).bundle_id === null, 'мусор в сборке отброшен')

const ctx = { userId: 'u1', deviceId: 'd1', clubId: 'c1', label: 'Планшет', now: NOW }
const first = applyDeviceReport(null, rep, ctx)
ok(first.problem_since === new Date(NOW).toISOString() && eq(first.problems, ['db_blocked']), 'первая проблема — problem_since = сейчас')
ok(applyDeviceReport({ ...first, id: 'r1' }, rep, { ...ctx, now: NOW + 20_000 }) === null, 'тот же отчёт через 20 с — не пишем')
const later = applyDeviceReport({ ...first, id: 'r1', last_pull_ok_at: 'old' }, rep, { ...ctx, now: NOW + 30 * MIN })
ok(later.problem_since === first.problem_since && !('id' in later), 'проблема держится — problem_since прежний, id не в upsert')
ok(!('last_pull_ok_at' in later), 'отчёт не затирает время успешной загрузки')
const cleared = applyDeviceReport(
  { ...first, id: 'r1', resolved_at: 'x', resolved_codes: ['db_blocked'], notified_codes: ['db_blocked'] },
  sanitizeDeviceReport({ problems: [] }),
  { ...ctx, now: NOW + 40 * MIN },
)
ok(cleared.problem_since === null && eq(cleared.notified_codes, []) && cleared.resolved_at === null, 'всё прошло — сброс отметок')
const dropServer = applyDeviceReport(
  { ...first, server_problems: ['server_no_pull'] },
  sanitizeDeviceReport({ problems: [] }),
  { ...ctx, now: NOW + 40 * MIN },
)
ok(eq(dropServer.server_problems, []), 'планшет загрузил данные — server_no_pull снят')

// --- «Решено»
const acked = { ...first, resolved_at: 'x', resolved_codes: ['db_blocked'] }
ok(!deviceNeedsAttention(acked), '«Решено» прячет карточку')
ok(deviceNeedsAttention({ ...acked, problems: ['db_blocked', 'queue_stuck'] }), 'новая проблема после «Решено» — снова карточка')

// --- server_no_pull
const alive = {
  problems: ['pull_failing'],
  server_problems: [],
  last_report_at: new Date(NOW - 10 * MIN).toISOString(),
  last_pull_ok_at: new Date(NOW - 3 * H).toISOString(),
}
ok(detectServerNoPull(alive, NOW, DAY), 'на связи, загрузка падает, сервер 3 ч без успеха — server_no_pull')
ok(!detectServerNoPull(alive, NOW, NIGHT), 'ночью не поднимаем')
ok(!detectServerNoPull({ ...alive, problems: [] }, NOW, DAY), 'планшет не видит сбоя загрузки — простой не тревога')
ok(!detectServerNoPull({ ...alive, last_report_at: new Date(NOW - 2 * H).toISOString() }, NOW, DAY), 'планшет не на связи — не server_no_pull')
ok(!detectServerNoPull({ ...alive, last_pull_ok_at: new Date(NOW - 30 * MIN).toISOString() }, NOW, DAY), 'недавний успех — не server_no_pull')

const upd = planDeviceServerUpdate(alive, NOW, DAY)
ok(eq(upd?.server_problems, ['server_no_pull']) && upd.problem_since === new Date(NOW).toISOString(), 'cron ставит server_no_pull')
ok(!('last_pull_ok_at' in upd) && !('last_report_at' in upd), 'cron меняет только поля состояния')
ok(planDeviceServerUpdate({ ...alive, server_problems: ['server_no_pull'] }, NOW, DAY) === null, 'уже стоит — не пишем повторно')
const silent = planDeviceServerUpdate(
  { problems: ['db_blocked'], server_problems: [], last_report_at: new Date(NOW - 25 * H).toISOString() },
  NOW,
  DAY,
)
ok(eq(silent?.problems, []) && silent.problem_since === null, 'сутки без отчётов — проблемы сняты')

// --- Push
const crit = { id: 'r1', problems: ['db_blocked'], server_problems: [], notified_codes: [], last_report_at: new Date(NOW - 5 * MIN).toISOString() }
ok(eq(planDevicePush(crit, NOW, NIGHT), { codes: ['db_blocked'], reminder: false }), 'новый критичный код — push сразу')
ok(planDevicePush({ ...crit, problems: ['build_stale'] }, NOW, DAY) === null, 'старая сборка — без push')
const notified = { ...crit, notified_codes: ['db_blocked'], notified_at: new Date(NOW - 30 * MIN).toISOString() }
ok(planDevicePush(notified, NOW, DAY) === null, 'уже сообщили 30 мин назад — молчим')
const old = { ...notified, notified_at: new Date(NOW - 3 * H).toISOString() }
ok(planDevicePush(old, NOW, DAY)?.reminder === true, 'через 2+ ч днём — напоминание')
ok(planDevicePush(old, NOW, NIGHT) === null, 'напоминание ночью — нет')
ok(planDevicePush({ ...old, last_report_at: new Date(NOW - 3 * H).toISOString() }, NOW, DAY) === null, 'устройство не на связи — без напоминаний')
ok(planDevicePush({ ...old, resolved_at: 'x', resolved_codes: ['db_blocked'] }, NOW, DAY) === null, 'после «Решено» — молчим')

const payload = buildDevicePushPayload(crit, 'Кукареко', { codes: ['db_blocked'], reminder: false })
ok(payload.tag === 'device-health-r1' && payload.url === '/admin/health', 'push: свой tag на устройство и ссылка на центр')
ok(payload.title.includes('Кукареко') && payload.body.includes('Скажите тренеру'), 'push: тренер и что сказать')

const view = toDeviceHealthView({ ...crit, queue_count: 3 }, { trainerName: 'Кукареко', clubName: 'X•fit' })
ok(view.critical && view.needs_attention && view.instruction.length > 0 && !('notified_codes' in view), 'вид для админа')

// --- Раскладка для админа
const { splitDeviceHealth, deviceHealthMessageHref } = await import('../src/lib/admin/deviceHealthViewCore.js')
const split = splitDeviceHealth([
  { id: 'a', trainer_name: 'Яна', needs_attention: true, critical: false, problem_since: '2026-10-14T06:00:00Z' },
  { id: 'b', trainer_name: 'Борис', needs_attention: true, critical: true, problem_since: '2026-10-14T08:00:00Z' },
  { id: 'c', trainer_name: 'Анна', needs_attention: false, critical: false },
])
ok(eq(split.attention.map((d) => d.id), ['b', 'a']), 'внимание: критичные сверху')
ok(eq(split.all.map((d) => d.id), ['c', 'b', 'a']), 'все устройства: по имени тренера')
const href = deviceHealthMessageHref({ user_id: 'u 1', codes: ['db_blocked'], instruction: 'Перезагрузите' })
ok(href.startsWith('/messages?dm=u%201&text=') && decodeURIComponent(href).includes('Перезагрузите'), 'ссылка в чат с готовым текстом')

// --- Cron: server_no_pull + push админам, повтор не шлёт
const jobRows = [
  { id: 'r1', user_id: 'u1', ...alive, notified_codes: [], created_at: new Date(NOW - 5 * H).toISOString() },
  { id: 'r2', user_id: 'u2', problems: [], server_problems: [], notified_codes: [], last_report_at: new Date(NOW - 5 * MIN).toISOString() },
]
const fakeStore = {
  async listRecent() {
    return { rows: jobRows, error: null }
  },
  async update(id, patch) {
    Object.assign(jobRows.find((r) => r.id === id), patch)
    return { data: [], error: null }
  },
}
const fakeDb = {
  from() {
    const q = {
      select: () => q,
      in: () => q,
      then: (resolve) => resolve({ data: [{ id: 'a1', role: 'admin', is_active: true }, { id: 'u1', name: 'Кукареко' }], error: null }),
    }
    return q
  },
}
const sent = []
const fakeSend = async (_db, userId, p) => {
  sent.push({ userId, p })
  return { ok: true }
}
const job = { db: fakeDb, store: fakeStore, send: fakeSend, pushReady: true }
let jr = await runDeviceHealthJob({ ...job, now: new Date(NOW) })
ok(jr.updated === 1 && eq(jobRows[0].server_problems, ['server_no_pull']), 'cron: server_no_pull записан')
ok(sent.length >= 1 && sent[0].p.tag === 'device-health-r1' && sent[0].p.title.includes('Кукареко'), 'cron: push админу по устройству')
ok(eq(jobRows[0].notified_codes, ['server_no_pull']) && Boolean(jobRows[0].notified_at), 'cron: отметка «сообщили»')
const before = sent.length
jr = await runDeviceHealthJob({ ...job, now: new Date(NOW + 5 * MIN) })
ok(sent.length === before && jr.updated === 0, 'cron через 5 мин: без повторного push и записи')
const dry = await runDeviceHealthJob({ ...job, now: new Date(NOW + 10 * MIN), dryRun: true })
ok(dry.dry_run === true && dry.with_problems === 1, 'dry-run считает, не шлёт')

if (failed) {
  console.error(`verify-device-health: ${failed} failed`)
  process.exit(1)
}
console.log('verify-device-health: all passed')
