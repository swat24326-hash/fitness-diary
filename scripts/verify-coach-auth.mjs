/**
 * Телефон тренера (/coach): пропуск typ coach не открывает API зала, телефон всегда ждёт админа,
 * планшетная привязка не видит телефонов, вход / продление / выход. Без базы и сети.
 * node scripts/verify-coach-auth.mjs
 */
import { buildOwnSession, hashOwnPassword } from '../api/_lib/authOwnCore.js'
import { verifyBearerOwn } from '../api/_lib/authPortOwn.js'
import { createAuthFailLimiter } from '../api/_lib/authRateLimitCore.js'
import { buildClientSession } from '../api/_lib/clientPortal/clientAuthCore.js'
import {
  COACH_REFRESH_TYP,
  COACH_TOKEN_TYP,
  buildCoachSession,
  coachAccessDenial,
  readCoachToken,
} from '../api/_lib/coach/coachAuthCore.js'
import { createCoachAuthHandler } from '../api/_lib/coach/coachAuthHandler.js'
import { requireCoachUser } from '../api/_lib/coach/requireCoachUser.js'
import {
  decideCoachDevice,
  decideRefreshDevice,
  decideSignInDevice,
  deviceKindOf,
  isCoachDeviceId,
  planAdminDeviceAction,
} from '../api/_lib/deviceBindingCore.js'
import { gateCoachDevice } from '../api/_lib/deviceBindingGate.js'
import { groupTrainerDevices } from '../src/lib/admin/trainerDevicesViewCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const SECRET = 'verify-coach-auth-secret-0123456789abcdef'
const prevSecret = process.env.JWT_SECRET
process.env.JWT_SECRET = SECRET

const TRAINER = 'trainer-1'
const PHONE = 'coach-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const PHONE_2 = 'coach-bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const TABLET = 'cccccccc-3333-4333-8333-cccccccccccc'
const ACTIVE_WINDOW = { active: true, sinceMs: Date.parse('2026-10-10T00:00:00Z'), legacyOpen: false }

function memoryDevices(initial = [], { failList = false } = {}) {
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
      n += 1
      rows.push({ id: `d-${n}`, user_id: userId, device_id: deviceId, status, label })
      return { error: null }
    },
    async setStatus(id, status) {
      const r = rows.find((x) => x.id === id)
      if (r) r.status = status
      return { error: null }
    },
    async touch(id, label) {
      const r = rows.find((x) => x.id === id)
      if (r && label) r.label = label
      return { error: null }
    },
  }
}

async function memoryCoachStore({ role = 'trainer', active = true, devices = [] } = {}) {
  const user = { id: TRAINER, email: 't@x', login: 'ivanov', name: 'Иванов Пётр', role, club_id: 'club-1', is_active: active }
  const passwordHash = await hashOwnPassword('Secret-123')
  const sessions = new Map()
  let n = 0
  const deviceStore = memoryDevices(devices)
  return {
    user,
    sessions,
    devices: deviceStore,
    db: {},
    async findUserByLogin(login) {
      return String(login).toLowerCase() === 'ivanov' ? { ...user, password_hash: passwordHash } : null
    },
    async loadUser(id) {
      return id === TRAINER ? user : null
    },
    async createSession(userId, deviceId) {
      n += 1
      const id = `sid-${n}`
      sessions.set(id, { id, user_id: userId, device_id: deviceId, revoked_at: null })
      return id
    },
    async loadSession(sid) {
      return sessions.get(sid) ?? null
    },
    async touchSession() {},
    async revokeSession(sid, userId) {
      const s = sessions.get(sid)
      if (s && s.user_id === userId) s.revoked_at = new Date().toISOString()
    },
  }
}

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) {
      res.headers[k] = v
    },
    end(chunk) {
      res.body = chunk ? JSON.parse(chunk) : null
    },
  }
  return res
}

function authHandler(store, limiter = createAuthFailLimiter({ perLoginIp: 3, perIp: 50, perLogin: 50 })) {
  const notify = async (userId, label) => store.devices.notified.push({ userId, label })
  return createCoachAuthHandler({ store, limiter, ownAuth: () => true, deviceDeps: { store: store.devices, notify } })
}

async function call(handler, body, { device = PHONE, ip = '10.0.0.1' } = {}) {
  const res = fakeRes()
  const headers = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1', ...(device ? { 'x-device-id': device } : {}) }
  await handler({ method: 'POST', headers, remoteAddress: ip, body }, res)
  return res
}

async function guard(store, token) {
  const res = fakeRes()
  const ctx = await requireCoachUser({ headers: { authorization: `Bearer ${token}` } }, res, store)
  return { ctx, res }
}

try {
  // --- Вид устройства по номеру ---
  ok(isCoachDeviceId(PHONE) && !isCoachDeviceId(TABLET) && !isCoachDeviceId('coach-'), 'телефон узнаётся по префиксу coach-')
  ok(deviceKindOf(PHONE) === 'coach' && deviceKindOf(TABLET) === 'tablet', 'deviceKindOf')

  // --- Телефон: всегда ждёт админа ---
  ok(decideCoachDevice({ deviceId: PHONE, devices: [] }).register === 'pending', 'первый телефон — ждёт, даже без других устройств')
  ok(!decideCoachDevice({ deviceId: TABLET, devices: [] }).allow, 'номер планшета на входе телефона — отказ')
  const phoneRow = { id: 'p1', device_id: PHONE, status: 'approved' }
  ok(decideCoachDevice({ deviceId: PHONE, devices: [phoneRow] }).allow, 'разрешённый телефон пускаем')
  const revoked = decideCoachDevice({ deviceId: PHONE, devices: [{ ...phoneRow, status: 'revoked' }] })
  ok(!revoked.allow && revoked.setStatus === 'pending', 'отозванный телефон при входе снова ждёт')

  // --- Планшетная привязка не видит телефонов ---
  const onlyPhone = [{ id: 'p1', device_id: PHONE, status: 'approved' }]
  const tabletFirst = decideSignInDevice({ role: 'trainer', deviceId: TABLET, devices: onlyPhone, window: ACTIVE_WINDOW })
  ok(tabletFirst.allow && tabletFirst.reason === 'first_device', 'разрешённый телефон не занимает место планшета')
  const phoneOnTablet = decideSignInDevice({ role: 'trainer', deviceId: PHONE, devices: onlyPhone, window: ACTIVE_WINDOW })
  ok(!phoneOnTablet.allow && phoneOnTablet.reason === 'no_device', 'номер телефона на входе планшета не открывает полный вход')
  const refreshPhone = decideRefreshDevice({
    role: 'trainer',
    session: { device_id: PHONE, created_at: '2026-10-11T00:00:00Z' },
    headerDeviceId: PHONE,
    devices: onlyPhone,
    window: ACTIVE_WINDOW,
  })
  ok(!refreshPhone.allow, 'сессия с телефоном не продлевается как планшетная')

  // --- Админ: «Разрешить» / «Заменить» по виду устройства ---
  const mixed = [
    { id: 't1', device_id: TABLET, status: 'approved' },
    { id: 'p1', device_id: PHONE, status: 'approved' },
    { id: 'p2', device_id: PHONE_2, status: 'pending' },
  ]
  const approvePhone = planAdminDeviceAction('approve', mixed[2], mixed)
  ok(
    approvePhone.updates.some((u) => u.id === 'p1' && u.status === 'revoked') && !approvePhone.updates.some((u) => u.id === 't1'),
    '«Разрешить» второй телефон отключает прежний телефон, планшет не трогает',
  )
  ok(approvePhone.revokeDeviceIds.includes(PHONE) && !approvePhone.revokeDeviceIds.includes(TABLET), 'сессии гасятся только у прежнего телефона')
  const newTablet = { id: 't2', device_id: 'dddddddd-4444-4444-8444-dddddddddddd', status: 'pending' }
  const replaceTablet = planAdminDeviceAction('replace', newTablet, [...mixed, newTablet])
  ok(!replaceTablet.updates.some((u) => u.id === 'p1'), '«Заменить» планшет не отключает телефон')
  const approveTablet = planAdminDeviceAction('approve', newTablet, [...mixed, newTablet])
  ok(approveTablet.updates.length === 1, '«Разрешить» второй планшет — как раньше, без замены')

  const grouped = groupTrainerDevices([
    { id: 't1', user_id: TRAINER, status: 'approved', kind: 'tablet' },
    { id: 'p2', user_id: TRAINER, status: 'pending', kind: 'coach' },
  ])
  ok(grouped.pending[0].isCoach && !grouped.pending[0].hasApproved, 'ждущий телефон при разрешённом планшете — не «замена»')

  // --- Шлюз входа с телефона ---
  const gateStore = memoryDevices()
  const gateDeps = { store: gateStore, notify: async (u, l) => gateStore.notified.push({ u, l }) }
  const g1 = await gateCoachDevice({ userId: TRAINER, deviceId: PHONE, label: 'Телефон тренера · iPhone' }, gateDeps)
  ok(!g1.allow && g1.code === 'device_pending' && gateStore.rows[0]?.status === 'pending', 'шлюз: новый телефон записан как ждущий')
  ok(gateStore.notified.length === 1, 'шлюз: админам ушло уведомление')
  const g2 = await gateCoachDevice({ userId: TRAINER, deviceId: PHONE }, { store: memoryDevices([], { failList: true }), notify: async () => {} })
  ok(!g2.allow && g2.code === 'busy', 'шлюз: база недоступна — «сервер занят», без входа')

  // --- Пропуск: не взаимозаменяем с сотрудником и клиентом ---
  const cs = buildCoachSession({ userId: TRAINER, sid: 'sid-x', deviceId: PHONE }, SECRET)
  ok(readCoachToken(cs.access_token, COACH_TOKEN_TYP, SECRET)?.deviceId === PHONE, 'пропуск телефона читается вместе с номером телефона')
  ok(readCoachToken(cs.refresh_token, COACH_TOKEN_TYP, SECRET) === null, 'refresh не годится как access')
  ok(readCoachToken(cs.access_token, COACH_REFRESH_TYP, SECRET) === null, 'access не годится как refresh')
  ok((await verifyBearerOwn(cs.access_token)).user === null, 'пропуск телефона не проходит verifyBearerOwn (trainer-pull, push-record, /rest/v1)')
  ok((await verifyBearerOwn(cs.refresh_token)).user === null, 'refresh телефона не проходит verifyBearerOwn')
  const staff = buildOwnSession({ id: TRAINER, email: 't@x', sid: 'sid-1' }, SECRET)
  ok(readCoachToken(staff.access_token, COACH_TOKEN_TYP, SECRET) === null, 'токен планшета не открывает /api/coach')
  const client = buildClientSession({ clientId: 'c1', sid: 's1' }, SECRET)
  ok(readCoachToken(client.access_token, COACH_TOKEN_TYP, SECRET) === null, 'токен клиента не открывает /api/coach')

  const live = { id: TRAINER, role: 'тренер', is_active: true }
  const sess = { user_id: TRAINER, revoked_at: null, device_id: PHONE }
  ok(coachAccessDenial({ user: live, session: sess, userId: TRAINER, deviceId: PHONE }) === null, 'роль «тренер» по-русски проходит')
  ok(coachAccessDenial({ user: { ...live, role: 'admin' }, session: sess, userId: TRAINER, deviceId: PHONE }) === 'role', 'админ — не через телефон тренера')
  ok(coachAccessDenial({ user: { ...live, role: '' }, session: sess, userId: TRAINER, deviceId: PHONE }) === 'role', 'пустая роль — отказ')
  ok(coachAccessDenial({ user: { ...live, is_active: false }, session: sess, userId: TRAINER, deviceId: PHONE }) === 'blocked', 'заблокирован')
  ok(coachAccessDenial({ user: live, session: { ...sess, revoked_at: 'x' }, userId: TRAINER, deviceId: PHONE }) === 'session', 'сессия отозвана')
  ok(coachAccessDenial({ user: live, session: { ...sess, device_id: PHONE_2 }, userId: TRAINER, deviceId: PHONE }) === 'session', 'сессия другого телефона')

  // --- Вход, ожидание, разрешение ---
  const store = await memoryCoachStore()
  const handler = authHandler(store)
  ok((await call(handler, { action: 'sign-in', login: 'ivanov', password: 'wrong' })).statusCode === 401, 'неверный пароль — 401')
  ok((await call(handler, { action: 'sign-in', login: 'nobody', password: 'Secret-123' })).body?.error === 'Неверный логин или пароль', 'нет логина — тот же текст, что и неверный пароль')
  ok((await call(handler, { action: 'sign-in', login: 'ivanov', password: 'Secret-123' }, { device: TABLET })).statusCode === 400, 'без номера телефона — 400')
  const pending = await call(handler, { action: 'sign-in', login: 'ivanov', password: 'Secret-123' })
  ok(pending.statusCode === 403 && pending.body?.code === 'device_pending' && !pending.body.session, 'первый вход — «ждёт разрешения», без пропуска')
  ok(store.devices.rows[0]?.label?.startsWith('Телефон тренера'), 'админ видит подпись «Телефон тренера»')
  store.devices.rows[0].status = 'approved'
  const signed = await call(handler, { action: 'sign-in', login: 'IVANOV', password: ' Secret-123 ' })
  ok(signed.statusCode === 200 && signed.body?.session?.access_token, 'после «Разрешить» вход выдаёт пропуск')
  ok(Object.keys(signed.body.user).join() === 'name', 'в ответе только имя')

  let g = await guard(store, signed.body.session.access_token)
  ok(g.ctx?.isTrainer && g.ctx.user.id === TRAINER && !g.ctx.isAdmin, 'requireCoachUser пускает и даёт контекст тренера')
  g = await guard(store, staff.access_token)
  ok(!g.ctx && g.res.statusCode === 401, 'токен планшета на /api/coach — 401')

  const rr = await call(handler, { action: 'refresh', refresh_token: signed.body.session.refresh_token })
  ok(rr.statusCode === 200 && rr.body?.session?.access_token, 'refresh продлевает')

  store.devices.rows[0].status = 'revoked'
  g = await guard(store, signed.body.session.access_token)
  ok(!g.ctx && g.res.statusCode === 401, '«Отозвать» действует сразу, не через час')
  const afterRevoke = await call(handler, { action: 'refresh', refresh_token: signed.body.session.refresh_token })
  ok(afterRevoke.statusCode === 401 && store.devices.rows[0].status === 'revoked', 'продление отозванного — 401, телефон не встаёт в очередь снова')
  store.devices.rows[0].status = 'approved'

  store.user.is_active = false
  g = await guard(store, signed.body.session.access_token)
  ok(!g.ctx && g.res.statusCode === 401, 'блок учётки закрывает телефон сразу')
  store.user.is_active = true

  ok((await call(handler, { action: 'sign-out', refresh_token: signed.body.session.refresh_token })).statusCode === 200, 'выход')
  g = await guard(store, signed.body.session.access_token)
  ok(!g.ctx, 'после выхода пропуск не работает')

  const admin = await memoryCoachStore({ role: 'admin', devices: [{ id: 'p1', user_id: TRAINER, device_id: PHONE, status: 'approved' }] })
  const adminTry = await call(authHandler(admin), { action: 'sign-in', login: 'ivanov', password: 'Secret-123' })
  ok(adminTry.statusCode === 403 && !adminTry.body.session && admin.devices.rows.length === 1, 'не тренер — 403, устройство не регистрируется')

  const limited = authHandler(await memoryCoachStore())
  for (let i = 0; i < 3; i += 1) await call(limited, { action: 'sign-in', login: 'ivanov', password: 'bad' }, { ip: '10.9.9.9' })
  ok((await call(limited, { action: 'sign-in', login: 'ivanov', password: 'bad' }, { ip: '10.9.9.9' })).statusCode === 429, 'лимит попыток — 429')

  const off = createCoachAuthHandler({ store, ownAuth: () => false })
  ok((await call(off, { action: 'sign-in', login: 'ivanov', password: 'Secret-123' })).statusCode === 503, 'не свой Auth на сервере — «скоро будет доступно»')
} finally {
  if (prevSecret == null) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = prevSecret
}

if (failed) {
  console.error(`\nverify-coach-auth: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-coach-auth: OK')
