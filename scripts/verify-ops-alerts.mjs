/**
 * node scripts/verify-ops-alerts.mjs — сторож прода → ВК (docs/RELIABILITY_PLAN.md, 2a):
 * когда писать «не работает» / «восстановилось», утренняя сводка, отправка в ВК.
 */
import { buildNightReport, lastBackupOk, summarizeApiLog } from '../api/_lib/opsAlert/nightReport.js'
import { parseVkPeerIds, sendVkAlert } from '../api/_lib/opsAlert/vkAlertSend.js'
import { REMIND_EVERY_MS, nextWatchdogState } from '../api/_lib/opsAlert/watchdogState.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const MIN = 60000
const T0 = Date.UTC(2026, 9, 9, 5, 0)
const up = { app: { ok: true }, db: { ok: true } }
const appDown = { app: { ok: false, detail: 'нет ответа 10 с' }, db: { ok: true } }

let r = nextWatchdogState(null, up, T0)
ok(r.messages.length === 0, 'всё работает — тишина')

r = nextWatchdogState(r.state, appDown, T0 + MIN)
ok(r.messages.length === 0, 'одна неудача (рестарт при выкатке) — ещё не пишем')
const blip = nextWatchdogState(r.state, up, T0 + 2 * MIN)
ok(blip.messages.length === 0 && blip.state.events.length === 0, 'поднялось после одной неудачи — ни тревоги, ни «восстановилось»')

r = nextWatchdogState(r.state, appDown, T0 + 2 * MIN)
ok(r.messages.length === 1 && r.messages[0].startsWith('НЕ РАБОТАЕТ: приложение'), `вторая неудача подряд — тревога (${r.messages[0]})`)
ok(r.messages[0].includes('нет ответа 10 с'), 'в тревоге причина')
ok(r.state.checks.app.downSince === T0 + MIN, 'простой считаем с первой неудачи')

r = nextWatchdogState(r.state, appDown, T0 + 10 * MIN)
ok(r.messages.length === 0, 'лежит дальше — не спамим каждую минуту')
r = nextWatchdogState(r.state, appDown, T0 + 2 * MIN + REMIND_EVERY_MS)
ok(r.messages.length === 1 && r.messages[0].startsWith('ВСЁ ЕЩЁ НЕ РАБОТАЕТ'), 'через 30 мин — напоминание')

r = nextWatchdogState(r.state, up, T0 + 41 * MIN)
ok(r.messages.length === 1 && r.messages[0] === 'ВОССТАНОВИЛОСЬ: приложение на сервере, простой 40 мин', `восстановление с длительностью (${r.messages[0]})`)
ok(r.state.events.length === 1 && r.state.events[0].key === 'app', 'простой записан для сводки')
const afterTwoDays = nextWatchdogState(r.state, up, T0 + 49 * 60 * MIN)
ok(afterTwoDays.state.events.length === 0, 'простои старше 48 ч забываются')

const two = nextWatchdogState(nextWatchdogState(null, { app: { ok: false }, site: { ok: false } }, T0).state, { app: { ok: false }, site: { ok: false } }, T0 + MIN)
ok(two.messages.length === 2, 'две упавшие проверки — две строки в одном сообщении')

const apiLines = [
  '[portable-api] http://127.0.0.1:8080',
  '[portable-api] static: /opt/fitness-diary/dist',
  '[portable-api] cloudKey: none',
  '[api] POST /api/push-record 500 120ms user=00000000-0000-0000-0000-000000000001',
  '[api] POST /api/push-record 502 90ms',
  '[api] GET /api/trainer-pull 503 20000ms',
  '[api] POST /api/auth-sign-in 401 30ms',
  '[api] POST /api/auth-sign-in 429 3ms',
  '[api] POST /api/push-record 429 3ms',
  '[pgrest] ECONNRESET',
  '[auth-v1] refresh: база недоступна Error',
  '[portable-api] Error: boom',
  '[portable-api] Error: aborted',
]
const s = summarizeApiLog(apiLines)
ok(s.errors5xx === 3, `5xx посчитаны (${s.errors5xx})`)
ok(s.topPaths[0] === '/api/push-record ×2', `самый частый путь первым (${s.topPaths[0]})`)
ok(s.loginLimited === 1, 'лимит попыток считаем только на входе')
ok(s.crashes === 1, 'стартовые строки сервера — не сбой, Error — сбой')
ok(s.clientAborts === 1, 'обрыв связи устройства (Error: aborted) — не сбой сервера')
const aborted = buildNightReport({ apiLines: ['[portable-api] Error: aborted'], backupLines: ['pg-backup: ок x'], state: null, diskUsedPct: 10, now: T0, label: 'Ядро' })
ok(!aborted.problems && aborted.text.includes('оборвало связь посреди запроса: 1'), 'обрыв связи — справка, сутки «всё в порядке»')
ok(s.dbErrors === 2, 'ошибки пула и «база недоступна»')

ok(lastBackupOk(['pg-backup: ок fd-2026-10-08.dump 1.6M', 'pg-backup: ок fd-2026-10-09.dump 1.7M']) === 'fd-2026-10-09.dump 1.7M', 'берём последнюю удачную копию')
ok(lastBackupOk(['pg-backup: в копии мало таблиц (3) — не принимаю']) === null, 'неудачная копия — не ок')

const clean = buildNightReport({ apiLines: ['[api] POST /api/auth-sign-in 401 30ms'], backupLines: ['pg-backup: ок fd-2026-10-09.dump 1.6M'], state: null, diskUsedPct: 34.4, now: T0, label: 'Ядро (app-core.ru)' })
ok(!clean.problems && clean.text.startsWith('Ядро (app-core.ru): сводка за сутки — всё в порядке'), 'чистые сутки — «всё в порядке»')
ok(clean.text.includes('Диск занят: 34%') && clean.text.includes('Копия базы: ок fd-2026-10-09'), 'в сводке диск и копия')

const noBackup = buildNightReport({ apiLines: [], backupLines: [], state: null, diskUsedPct: 10, now: T0, label: 'Ядро' })
ok(noBackup.problems && noBackup.text.includes('СВЕЖЕЙ НЕТ'), 'нет копии базы — проблема')
const fullDisk = buildNightReport({ apiLines: [], backupLines: ['pg-backup: ок x'], state: null, diskUsedPct: 90, now: T0, label: 'Ядро' })
ok(fullDisk.problems && fullDisk.text.includes('пора чистить'), 'диск 90% — проблема')
const withOutage = buildNightReport({ apiLines: [], backupLines: ['pg-backup: ок x'], state: r.state, diskUsedPct: 10, now: T0 + 60 * MIN, label: 'Ядро' })
ok(withOutage.problems && withOutage.text.includes('приложение на сервере 08:01–08:41 (40 мин)'), `простой по МСК в сводке (${withOutage.text.split('\n')[1]})`)

const okBackup = ['pg-backup: ок fd-2026-10-09.dump 1.6M']
const noCloudCfg = buildNightReport({ apiLines: [], backupLines: okBackup, state: null, diskUsedPct: 10, now: T0, label: 'Ядро' })
ok(!noCloudCfg.problems && !noCloudCfg.text.includes('хранилище'), 'бакет не подключён — строк про хранилище нет, тревоги нет')
const cloudOk = buildNightReport({
  apiLines: [], cloudExpected: true, state: null, diskUsedPct: 10, now: T0, label: 'Ядро',
  backupLines: [...okBackup, 'pg-backup: облако ок daily/fd-2026-10-09.dump.gpg 1.6M'],
  drillLines: ['pg-restore-drill: FAIL 2026-09-01 старая', 'pg-restore-drill: ок 2026-10-01 daily/fd-2026-10-01.dump.gpg'],
})
ok(!cloudOk.problems && cloudOk.text.includes('Копия в хранилище: ок daily/fd-2026-10-09') && cloudOk.text.includes('Пробное восстановление: ок 2026-10-01'), 'хранилище и последнее восстановление ок')
const cloudMissing = buildNightReport({ apiLines: [], backupLines: okBackup, drillLines: ['pg-restore-drill: ок 2026-10-01 x'], cloudExpected: true, state: null, diskUsedPct: 10, now: T0, label: 'Ядро' })
ok(cloudMissing.problems && cloudMissing.text.includes('НЕ УШЛА'), 'копия не ушла в хранилище — проблема')
const drillFail = buildNightReport({ apiLines: [], backupLines: [...okBackup, 'pg-backup: облако ок k'], drillLines: ['pg-restore-drill: FAIL 2026-10-01 k: clients в копии 1, в проде 1600'], cloudExpected: true, state: null, diskUsedPct: 10, now: T0, label: 'Ядро' })
ok(drillFail.problems && drillFail.text.includes('НЕ ПРОШЛО 2026-10-01 k: clients'), 'восстановление не прошло — проблема с причиной')
const drillNone = buildNightReport({ apiLines: [], backupLines: [...okBackup, 'pg-backup: облако ок k'], drillLines: [], cloudExpected: true, state: null, diskUsedPct: 10, now: T0, label: 'Ядро' })
ok(drillNone.problems && drillNone.text.includes('не было больше месяца'), 'восстановления не было > 40 дн. — проблема')

ok(parseVkPeerIds(' 123, abc,456,123,') .join() === '123,456', 'получатели: только числа, без повторов')

const calls = []
const fakeFetch = async (url, init) => {
  const peer = init.body.get('peer_id')
  calls.push({ url, peer, token: init.body.get('access_token'), random: init.body.get('random_id') })
  const body = peer === '2' ? { error: { error_code: 901, error_msg: "Can't send messages" } } : { response: 1 }
  return { json: async () => body }
}
const sent = await sendVkAlert({ token: 't', peerIds: ['1', '2', '3'], text: 'x', fetchImpl: fakeFetch })
ok(sent.sent === 2 && calls.length === 3, 'ошибка одного получателя не мешает остальным')
ok(sent.errors[0]?.includes('не писал сообществу'), `понятная ошибка 901 (${sent.errors[0]})`)
ok(calls[0].url.endsWith('/messages.send') && calls[0].token === 't' && Number(calls[0].random) > 0, 'messages.send с ключом и random_id')
const noKey = await sendVkAlert({ token: '', peerIds: ['1'], text: 'x', fetchImpl: fakeFetch })
ok(noKey.sent === 0 && noKey.errors.length === 1 && calls.length === 3, 'без ключа — в ВК не ходим')

const { handler: uptimeHandler } = await import('../ops/uptime-function/index.mjs')
const store = new Map()
const vkTexts = []
let siteUp = false
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  if (u.startsWith('https://storage.yandexcloud.net/')) {
    if (init.headers?.['X-YaCloud-SubjectToken'] !== 'fn-token') return { ok: false, status: 403 }
    if (init.method === 'PUT') {
      store.set(u, init.body)
      return { ok: true, status: 200 }
    }
    return store.has(u) ? { ok: true, status: 200, json: async () => JSON.parse(store.get(u)) } : { ok: false, status: 404 }
  }
  if (u.startsWith('https://api.vk.com/')) {
    vkTexts.push(init.body.get('message'))
    return { json: async () => ({ response: 1 }) }
  }
  if (u === 'https://app-core.example/api/health') {
    if (!siteUp) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    return { ok: true, status: 200 }
  }
  throw new Error(`неожиданный адрес ${u}`)
}
Object.assign(process.env, { TARGET_URL: 'https://app-core.example/api/health', STATE_BUCKET: 'st', VK_ALERT_TOKEN: 'vk', VK_ALERT_PEER_IDS: '1' })
const ctx = { token: { access_token: 'fn-token' } }
await uptimeHandler({}, ctx)
ok(vkTexts.length === 0 && store.size === 1, 'внешняя проверка: первая неудача — состояние сохранено, тишина')
await uptimeHandler({}, ctx)
ok(vkTexts.length === 1 && vkTexts[0].includes('проверка снаружи') && vkTexts[0].includes('сервер мог лечь целиком') && vkTexts[0].includes('ECONNREFUSED'), `внешняя проверка: вторая подряд — тревога в ВК (${vkTexts[0]?.split('\n')[1]})`)
siteUp = true
await uptimeHandler({}, ctx)
ok(vkTexts.length === 2 && vkTexts[1].includes('ВОССТАНОВИЛОСЬ'), 'внешняя проверка: ожил — «восстановилось»')
globalThis.fetch = realFetch

if (failed) {
  console.error(`verify-ops-alerts: ${failed} FAIL`)
  process.exit(1)
}
console.log('verify-ops-alerts: всё ок')
