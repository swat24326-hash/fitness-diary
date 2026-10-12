/**
 * Нагрузочный тест стенда (docs/CAPACITY_PLAN.md, этап B): сид только на стенде, профиль данных, пороги ступени.
 */
import {
  LOAD_DEFAULTS,
  buildDeskClients,
  buildLoadTrainer,
  buildTrainingData,
  loadSeedGuardError,
} from '../src/lib/loadTest/loadSeedCore.js'
import { LOAD_SLOW_P95_MS, loadStepVerdict, percentile, summarizeLoadStep } from '../src/lib/loadTest/loadStatsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const prodUrl = 'postgres://osapp:x@rc1d-abc.mdb.yandexcloud.net:6432/fitness_diary?sslmode=verify-full'
const standUrl = 'postgres://osapp:x@127.0.0.1:5432/fitness_diary'
ok(loadSeedGuardError({ databaseUrl: prodUrl, hostname: 'app-core-stand' })?.includes('не локальная'), 'база прода — отказ даже на стенде')
ok(loadSeedGuardError({ databaseUrl: standUrl, hostname: 'app-core-prod' })?.includes('не стенд'), 'локальная база не на стенде — отказ')
ok(loadSeedGuardError({ databaseUrl: 'мусор', hostname: 'app-core-stand' }) != null, 'неразбираемый URL — отказ')
ok(loadSeedGuardError({ databaseUrl: standUrl, hostname: 'app-core-stand' }) === null, 'стенд + локальная база — можно')

const size = JSON.stringify(buildTrainingData(4300, 'm1')).length
ok(size >= 4300 && size < 4300 + 600, `data тренировки ~4,3 КБ (${size} байт)`)

let n = 0
const newId = () => `id-${++n}`
const t = buildLoadTrainer({ index: 6, clubId: 'club', typeId: 'type', passwordHash: 'h', today: '2026-10-13', newId })
ok(t.user.login === 'load-t0007' && t.user.role === 'trainer', 'логин тренера по номеру')
ok(t.clients.length === LOAD_DEFAULTS.clientsPerTrainer && t.clients.every((c) => c.trainer_id === t.user.id), 'клиенты закреплены за тренером')
ok(t.trainings.length === LOAD_DEFAULTS.trainingsPerTrainer, 'тренировок как у загруженного тренера ×2 окна')
const in90 = t.trainings.filter((x) => x.date >= '2026-07-15').length
ok(in90 >= 330 && in90 <= 345, `в окне pull 90 дней ~335 тренировок (${in90})`)
ok(t.trainings.every((x) => x.date <= '2026-10-13' && x.date >= '2026-04-16'), 'даты тренировок в пределах 180 дней')
const mByClient = new Map(t.memberships.map((m) => [m.client_id, m.id]))
ok(t.trainings.every((x) => x.data.membership_id === mByClient.get(x.client_id)), 'тренировка ссылается на абонемент своего клиента')
const phones = new Set([...t.clients, ...buildDeskClients({ count: 3, offset: 0, clubId: 'club', newId })].map((c) => c.phone))
ok(phones.size === t.clients.length + 3, 'телефоны не повторяются')
ok(buildDeskClients({ count: 2, offset: 10, clubId: 'club', newId }).every((c) => c.desk_hall === 'az' && !c.trainer_id), 'клиенты базы — АЗ без тренера (проходит CHECK)')

ok(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95) === 10 && percentile([1, 2, 3, 4], 0.5) === 2, 'перцентили')
const fast = summarizeLoadStep(Array.from({ length: 100 }, () => ({ ms: 800, status: 200, bytes: 2048 })), 1000)
ok(loadStepVerdict(fast) === 'ok' && fast.avgKb === 2, 'быстрая ступень — ok')
const slow = summarizeLoadStep(Array.from({ length: 100 }, (_, i) => ({ ms: i < 90 ? 1000 : LOAD_SLOW_P95_MS + 1, status: 200, bytes: 1 })), 1)
ok(loadStepVerdict(slow) === 'slow', 'p95 > 15 с — slow (тренер ждёт)')
const timeouts = summarizeLoadStep(Array.from({ length: 100 }, (_, i) => ({ ms: i < 2 ? 46_000 : 500, status: 200, bytes: 1 })), 1)
ok(loadStepVerdict(timeouts) === 'broken' && timeouts.errors === 2, 'ответ дольше 45 с — для планшета ошибка (обрыв Sync)')
const errs = summarizeLoadStep([...Array.from({ length: 97 }, () => ({ ms: 1, status: 200, bytes: 1 })), { ms: 1, status: 503, bytes: 0 }, { ms: 1, status: 0, bytes: 0 }, { ms: 1, status: 503, bytes: 0 }], 1)
ok(loadStepVerdict(errs) === 'broken' && errs.byStatus['503'] === 2 && errs.byStatus['0'] === 1, '3% ошибок — broken, по кодам')

if (failed) {
  console.error(`verify-load-test: FAIL (${failed})`)
  process.exit(1)
}
console.log('verify-load-test: ок')
