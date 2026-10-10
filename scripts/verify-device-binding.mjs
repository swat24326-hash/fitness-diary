/**
 * Привязка устройств тренера: решения, окно запуска, «Разрешить/Заменить/Отозвать», вход и продление.
 * node scripts/verify-device-binding.mjs
 */
import {
  decideRefreshDevice,
  decideSignInDevice,
  deviceBindingWindow,
  deviceLabelFromUserAgent,
  isDeviceBoundRole,
  normalizeDeviceId,
  planAdminDeviceAction,
} from '../api/_lib/deviceBindingCore.js'
import { gateRefreshDevice, gateSignInDevice } from '../api/_lib/deviceBindingGate.js'
import { buildOwnSession, hashOwnPassword } from '../api/_lib/authOwnCore.js'
import { refreshOwnSession, signInWithPasswordOwn } from '../api/_lib/authPortOwn.js'
import { handleAuthV1 } from '../api/_lib/authV1Handler.js'
import {
  DEVICE_PENDING_RU,
  DEVICE_UPDATE_APP_RU,
  isDeviceBindingMessage,
  readOrCreateDeviceId,
} from '../src/lib/deviceIdentityCore.js'
import { groupTrainerDevices } from '../src/lib/admin/trainerDevicesViewCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  }
}

const DAY = 86400000
const SINCE = '2026-10-12T00:00:00Z'
const SINCE_MS = Date.parse(SINCE)
const DEV_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const DEV_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const DEV_C = 'cccccccc-3333-4333-8333-cccccccccccc'

/** user_devices в памяти. */
function memoryDevices(initial = [], { failList = false, failInsert = false } = {}) {
  const rows = initial.map((r) => ({ ...r }))
  let n = rows.length
  return {
    rows,
    notified: [],
    async listForUser(userId) {
      if (failList) return { rows: null, error: 'база недоступна' }
      return { rows: rows.filter((r) => r.user_id === userId), error: null }
    },
    async insert({ userId, deviceId, status, label }) {
      if (failInsert) return { error: 'insert failed' }
      n += 1
      rows.push({ id: `d-${n}`, user_id: userId, device_id: deviceId, status, label })
      return { error: null }
    },
    async setStatus(id, status) {
      const r = rows.find((x) => x.id === id)
      if (r) r.status = status
      return { error: null }
    },
    async touch() {
      return { error: null }
    },
  }
}

function deps(store) {
  return { store, notify: async (userId, label) => store.notified.push({ userId, label }) }
}

function memorySessions() {
  const rows = new Map()
  let n = 0
  return {
    rows,
    async create(userId, deviceId = null) {
      n += 1
      const id = `sid-${n}`
      rows.set(id, { id, user_id: userId, revoked_at: null, device_id: deviceId, created_at: new Date().toISOString() })
      return { sid: id, error: null }
    },
    async load(sid) {
      return { row: rows.get(sid) ?? null, error: null }
    },
    async touch() {
      return { error: null }
    },
    async bindDevice(sid, deviceId) {
      const r = rows.get(sid)
      if (r) r.device_id = deviceId
      return { error: null }
    },
  }
}

function mockRes() {
  return {
    statusCode: 0,
    body: '',
    headers: {},
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v
    },
    end(b) {
      this.body = b ?? ''
    },
  }
}

const prev = {
  AUTH_PROVIDER: process.env.AUTH_PROVIDER,
  JWT_SECRET: process.env.JWT_SECRET,
  DEVICE_BINDING_SINCE: process.env.DEVICE_BINDING_SINCE,
}

try {
  // Чистые решения
  ok(isDeviceBoundRole('trainer') && !isDeviceBoundRole('admin') && !isDeviceBoundRole('sales_manager'), 'привязка только для тренера')
  ok(normalizeDeviceId(DEV_A) === DEV_A && normalizeDeviceId('short') === null && normalizeDeviceId('x'.repeat(65)) === null, 'номер устройства: формат')
  ok(normalizeDeviceId("aaaaaaaaaaaaaaaa'; drop") === null, 'номер устройства: без мусора')
  ok(!deviceBindingWindow(undefined, SINCE_MS).active && !deviceBindingWindow('мусор', SINCE_MS).active, 'без env — выключено')
  ok(!deviceBindingWindow(SINCE, SINCE_MS - 1).active, 'до даты старта — выключено')
  const w0 = deviceBindingWindow(SINCE, SINCE_MS + DAY)
  const w8 = deviceBindingWindow(SINCE, SINCE_MS + 8 * DAY)
  ok(w0.active && w0.legacyOpen && w8.active && !w8.legacyOpen, 'окно старого бандла — 7 дней')
  ok(deviceLabelFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1') === 'iPad · Safari', 'подпись iPad')
  ok(deviceLabelFromUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome/120 Safari/537.36') === 'Android-планшет · Chrome', 'подпись Android')

  const T = 'trainer'
  ok(decideSignInDevice({ role: 'admin', deviceId: null, devices: [], window: w8 }).allow, 'админ входит без привязки')
  ok(decideSignInDevice({ role: T, deviceId: DEV_A, devices: [], window: deviceBindingWindow(undefined, 0) }).allow, 'выключено — тренер входит')
  ok(decideSignInDevice({ role: T, deviceId: null, devices: [], window: w0 }).allow, 'старый бандл в окне — пускаем')
  ok(decideSignInDevice({ role: T, deviceId: null, devices: [], window: w8 }).reason === 'no_device', 'старый бандл после окна — «обновите»')
  const first = decideSignInDevice({ role: T, deviceId: DEV_A, devices: [], window: w8 })
  ok(first.allow && first.register === 'approved' && first.bind === DEV_A, 'первое устройство — разрешено сразу')
  const approvedA = [{ id: 'd1', device_id: DEV_A, status: 'approved' }]
  const second = decideSignInDevice({ role: T, deviceId: DEV_B, devices: approvedA, window: w8 })
  ok(!second.allow && second.register === 'pending', 'второе устройство — ждёт админа')
  ok(decideSignInDevice({ role: T, deviceId: DEV_A, devices: approvedA, window: w8 }).allow, 'своё устройство — входит')
  const again = decideSignInDevice({ role: T, deviceId: DEV_B, devices: [...approvedA, { id: 'd2', device_id: DEV_B, status: 'pending' }], window: w8 })
  ok(!again.allow && !again.register && !again.setStatus, 'повтор с ожидающего — без дубля записи')
  const revokedRetry = decideSignInDevice({ role: T, deviceId: DEV_B, devices: [...approvedA, { id: 'd2', device_id: DEV_B, status: 'revoked' }], window: w8 })
  ok(!revokedRetry.allow && revokedRetry.setStatus === 'pending', 'отозванное — снова в ожидание к админу')

  // Продление
  const oldSession = { device_id: null, created_at: new Date(SINCE_MS - DAY).toISOString() }
  const newSession = { device_id: null, created_at: new Date(SINCE_MS + DAY).toISOString() }
  const gf = decideRefreshDevice({ role: T, session: oldSession, headerDeviceId: DEV_B, devices: approvedA, window: w8 })
  ok(gf.allow && gf.register === 'approved' && gf.bind === DEV_B, 'сессия до старта — устройство «как было», разрешаем')
  ok(decideRefreshDevice({ role: T, session: null, headerDeviceId: DEV_C, devices: [], window: w8 }).allow, 'токен без sid — тоже как было')
  ok(!decideRefreshDevice({ role: T, session: oldSession, headerDeviceId: DEV_B, devices: [{ id: 'd2', device_id: DEV_B, status: 'revoked' }], window: w8 }).allow, 'отозванное админом — не продлевается даже по старой сессии')
  const gfPending = decideRefreshDevice({ role: T, session: oldSession, headerDeviceId: DEV_B, devices: [{ id: 'd2', device_id: DEV_B, status: 'pending' }], window: w8 })
  ok(gfPending.allow && gfPending.setStatus === 'approved', 'старая сессия с ожидающего — разрешаем')
  ok(!decideRefreshDevice({ role: T, session: newSession, headerDeviceId: DEV_B, devices: approvedA, window: w8 }).allow, 'новая сессия без устройства — как вход: второе ждёт')
  ok(decideRefreshDevice({ role: T, session: { device_id: DEV_A }, headerDeviceId: null, devices: approvedA, window: w8 }).allow, 'привязанная сессия — по статусу устройства')
  ok(!decideRefreshDevice({ role: T, session: { device_id: DEV_A }, headerDeviceId: DEV_A, devices: [{ id: 'd1', device_id: DEV_A, status: 'revoked' }], window: w8 }).allow, 'отозвали — продление закрыто')
  ok(decideRefreshDevice({ role: T, session: newSession, headerDeviceId: null, devices: [], window: w0 }).allow, 'продление старым бандлом в окне — пускаем')

  // Действия админа
  const devs = [
    { id: 'd1', user_id: 'u1', device_id: DEV_A, status: 'approved' },
    { id: 'd2', user_id: 'u1', device_id: DEV_B, status: 'pending' },
  ]
  const approve = planAdminDeviceAction('approve', devs[1], devs)
  ok(approve.updates.length === 1 && approve.updates[0].status === 'approved' && !approve.revokeDeviceIds.length, '«Разрешить» — добавляет второе')
  const replace = planAdminDeviceAction('replace', devs[1], devs)
  ok(replace.updates.some((u) => u.id === 'd1' && u.status === 'revoked') && replace.revokeDeviceIds[0] === DEV_A, '«Заменить» — старое отозвано вместе с сессиями')
  const revoke = planAdminDeviceAction('revoke', devs[0], devs)
  ok(revoke.updates[0].status === 'revoked' && revoke.revokeDeviceIds[0] === DEV_A, '«Отозвать» — устройство и его сессии')
  ok(planAdminDeviceAction('hack', devs[0], devs).error && planAdminDeviceAction('approve', null, devs).error, 'неизвестное действие / нет устройства')

  // Клиент
  const mem = new Map()
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  const id1 = readOrCreateDeviceId(storage, () => DEV_C)
  ok(id1 === DEV_C && readOrCreateDeviceId(storage, () => DEV_A) === DEV_C, 'номер устройства живёт в localStorage')
  ok(isDeviceBindingMessage(DEVICE_PENDING_RU) && isDeviceBindingMessage(DEVICE_UPDATE_APP_RU) && !isDeviceBindingMessage('Неверный логин'), 'клиент узнаёт отказ по устройству')
  const grouped = groupTrainerDevices([
    { id: 'd1', user_id: 'u1', trainer_name: 'Аня', status: 'approved' },
    { id: 'd2', user_id: 'u1', trainer_name: 'Аня', status: 'pending' },
    { id: 'd3', user_id: 'u2', trainer_name: 'Боря', status: 'pending' },
  ])
  ok(grouped.pending.length === 2 && grouped.pending.find((d) => d.id === 'd2')?.hasApproved && !grouped.pending.find((d) => d.id === 'd3')?.hasApproved, 'админ: «Заменить» только если есть разрешённое')

  // Гейт с базой в памяти
  process.env.DEVICE_BINDING_SINCE = SINCE
  const now = SINCE_MS + 8 * DAY
  {
    const s = memoryDevices()
    const g1 = await gateSignInDevice({ userId: 'u1', role: T, deviceId: DEV_A, userAgent: 'iPad Safari', now }, deps(s))
    ok(g1.allow && g1.sessionDeviceId === DEV_A && s.rows[0]?.status === 'approved', 'гейт: первое устройство записано разрешённым')
    const g2 = await gateSignInDevice({ userId: 'u1', role: T, deviceId: DEV_B, userAgent: 'Android Chrome', now }, deps(s))
    ok(!g2.allow && g2.code === 'device_pending' && g2.error === DEVICE_PENDING_RU, 'гейт: второе — ждёт')
    await new Promise((r) => setTimeout(r, 0))
    ok(s.rows.length === 2 && s.rows[1].status === 'pending' && s.notified.length === 1, 'гейт: ожидающее записано, админ уведомлён')
    await gateSignInDevice({ userId: 'u1', role: T, deviceId: DEV_B, now }, deps(s))
    await new Promise((r) => setTimeout(r, 0))
    ok(s.rows.length === 2 && s.notified.length === 1, 'гейт: повтор не плодит записи и пуши')
    const g3 = await gateSignInDevice({ userId: 'u1', role: T, deviceId: null, now }, deps(s))
    ok(!g3.allow && g3.code === 'device_update', 'гейт: старый бандл после окна')
    const busy = await gateSignInDevice({ userId: 'u1', role: T, deviceId: DEV_A, now }, deps(memoryDevices([], { failList: true })))
    ok(!busy.allow && busy.code === 'busy' && busy.transient, 'гейт: база недоступна — «повторите», не «ждите админа»')
    const prevWarn = console.warn
    console.warn = () => {}
    const busy2 = await gateSignInDevice({ userId: 'u1', role: T, deviceId: DEV_A, now }, deps(memoryDevices([], { failInsert: true })))
    console.warn = prevWarn
    ok(!busy2.allow && busy2.code === 'busy', 'гейт: сбой записи — «повторите»')
    const admin = await gateSignInDevice({ userId: 'u9', role: 'admin', deviceId: null, now }, deps(memoryDevices([], { failList: true })))
    ok(admin.allow, 'гейт: админа база устройств не трогает')
    const r1 = await gateRefreshDevice({ userId: 'u1', role: T, session: { device_id: null, created_at: new Date(SINCE_MS - DAY).toISOString() }, headerDeviceId: DEV_C, now }, deps(s))
    ok(r1.allow && r1.bindDevice === DEV_C && s.rows.find((d) => d.device_id === DEV_C)?.status === 'approved', 'гейт: старая сессия привязывается к своему устройству')
  }

  // Вход и продление целиком
  process.env.AUTH_PROVIDER = 'own'
  process.env.JWT_SECRET = 'verify-device-binding-secret-32chars'
  process.env.DEVICE_BINDING_SINCE = new Date(Date.now() - 8 * DAY).toISOString()
  {
    const hash = await hashOwnPassword('Trainer-pass-1')
    const user = { id: 'u1', email: 't@club.ru', role: 'trainer', is_active: true, password_hash: hash }
    const findUser = async () => ({ row: user, error: null })
    const store = memoryDevices()
    const sessions = memorySessions()
    const signDeps = { findUser, sessions, deviceDeps: deps(store) }
    const a = await signInWithPasswordOwn('', '', { email: user.email, password: 'Trainer-pass-1', deviceId: DEV_A }, signDeps)
    const sidA = JSON.parse(Buffer.from(a.session.refresh_token.split('.')[1], 'base64url').toString()).sid
    ok(a.session && sessions.rows.get(sidA)?.device_id === DEV_A, 'вход: первое устройство, сессия знает устройство')
    const b = await signInWithPasswordOwn('', '', { email: user.email, password: 'Trainer-pass-1', deviceId: DEV_B }, signDeps)
    ok(!b.session && b.code === 'device_pending', 'вход: второй планшет ждёт админа')
    const wrong = await signInWithPasswordOwn('', '', { email: user.email, password: 'wrong-pass', deviceId: DEV_B }, signDeps)
    ok(!wrong.session && !wrong.code, 'неверный пароль — обычная ошибка, устройство не раскрываем')

    const loadUser = async () => ({ row: user, error: null })
    const refreshed = await refreshOwnSession(a.session.refresh_token, loadUser, sessions, { headerDeviceId: DEV_A, deviceDeps: deps(store) })
    ok(refreshed.session, 'продление со своего устройства')
    store.rows.find((d) => d.device_id === DEV_A).status = 'revoked'
    const cut = await refreshOwnSession(a.session.refresh_token, loadUser, sessions, { headerDeviceId: DEV_A, deviceDeps: deps(store) })
    ok(!cut.session && !cut.transient, 'отозвали устройство — продление закрыто (400, не 503)')

    const legacy = buildOwnSession({ id: 'u1', email: user.email }, process.env.JWT_SECRET)
    const gfStore = memoryDevices([{ id: 'd1', user_id: 'u1', device_id: DEV_A, status: 'approved' }])
    const gf = await refreshOwnSession(legacy.refresh_token, loadUser, sessions, { headerDeviceId: DEV_C, deviceDeps: deps(gfStore) })
    const gfSid = JSON.parse(Buffer.from(gf.session.refresh_token.split('.')[1], 'base64url').toString()).sid
    ok(gf.session && sessions.rows.get(gfSid)?.device_id === DEV_C, 'токен до 06.10: новая сессия сразу с устройством')

    const res = mockRes()
    await handleAuthV1(
      {
        method: 'POST',
        url: '/auth/v1/token?grant_type=password',
        headers: { 'x-device-id': DEV_B },
        query: { grant_type: 'password' },
        body: { email: user.email, password: 'Trainer-pass-1' },
        socket: { remoteAddress: '10.0.0.1' },
      },
      res,
      { signInDeps: signDeps },
    )
    ok(res.statusCode === 400 && String(res.body).includes(DEVICE_PENDING_RU), '/auth/v1: отказ по устройству с текстом для тренера')
  }
} finally {
  for (const [k, v] of Object.entries(prev)) {
    if (v == null) delete process.env[k]
    else process.env[k] = v
  }
}

if (failed) {
  console.error(`verify-device-binding: ${failed} ошибок`)
  process.exit(1)
}
console.log('verify-device-binding: ок')
