/**
 * Вход клиента в /me: приглашение, токены typ client, изоляция от токенов сотрудника, права выдачи.
 * Без базы и сети — хранилище в памяти.
 * node scripts/verify-client-auth.mjs
 */
import { buildOwnSession } from '../api/_lib/authOwnCore.js'
import { verifyBearerOwn } from '../api/_lib/authPortOwn.js'
import { createAuthFailLimiter } from '../api/_lib/authRateLimitCore.js'
import {
  CLIENT_REFRESH_TYP,
  CLIENT_TOKEN_TYP,
  buildClientSession,
  clientSessionDenial,
  hashInviteToken,
  inviteDenial,
  newInviteToken,
  readClientToken,
} from '../api/_lib/clientPortal/clientAuthCore.js'
import { createClientAuthHandler } from '../api/_lib/clientPortal/clientAuthHandler.js'
import { canStaffInviteClient } from '../api/_lib/clientPortal/clientInviteCore.js'
import { requireClientUser } from '../api/_lib/clientPortal/requireClientUser.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const SECRET = 'verify-client-auth-secret-0123456789abcdef'
const prevSecret = process.env.JWT_SECRET
process.env.JWT_SECRET = SECRET

const CLUB = '11111111-1111-4111-8111-111111111111'
const OTHER_CLUB = '22222222-2222-4222-8222-222222222222'
const CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TRAINER = 'tttttttt'
const NOW = Date.parse('2026-10-07T12:00:00Z')

function memoryStore() {
  const invites = new Map()
  const sessions = new Map()
  const clients = new Map([[CLIENT, { id: CLIENT, name: 'Иванова Анна', club_id: CLUB, trainer_id: TRAINER, archived_at: null }]])
  let n = 0
  return {
    invites,
    sessions,
    clients,
    async loadClient(id) {
      return clients.get(id) ?? null
    },
    async createInvite({ clientId, clubId, tokenHash, expiresAt }) {
      n += 1
      invites.set(tokenHash, { id: `inv-${n}`, client_id: clientId, club_id: clubId, expires_at: expiresAt, used_at: null })
    },
    async loadInviteByHash(h) {
      return invites.get(h) ?? null
    },
    async markInviteUsed(id) {
      for (const row of invites.values()) {
        if (row.id === id && !row.used_at) {
          row.used_at = new Date().toISOString()
          return true
        }
      }
      return false
    },
    async createSession(clientId) {
      n += 1
      const id = `sess-${n}`
      sessions.set(id, { id, client_id: clientId, revoked_at: null })
      return id
    },
    async loadSession(sid) {
      return sessions.get(sid) ?? null
    },
    async touchSession() {},
    async revokeSession(sid, clientId) {
      const s = sessions.get(sid)
      if (s && s.client_id === clientId) s.revoked_at = new Date().toISOString()
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

async function call(handler, body, ip = '10.0.0.1') {
  const res = fakeRes()
  await handler({ method: 'POST', headers: {}, remoteAddress: ip, body }, res)
  return res
}

try {
  // --- Чистые функции ---
  const token = newInviteToken()
  ok(token.length >= 30 && /^[A-Za-z0-9_-]+$/.test(token), 'токен приглашения base64url')
  ok(hashInviteToken(token)?.length === 64, 'хэш sha256 hex')
  ok(hashInviteToken(token) === hashInviteToken(` ${token} `), 'хэш не зависит от пробелов по краям')
  ok(hashInviteToken('short') === null && hashInviteToken('a b c d e f g h i j k l m') === null, 'мусор не хэшируется')

  const client = { id: CLIENT, club_id: CLUB, archived_at: null }
  const live = { club_id: CLUB, used_at: null, expires_at: new Date(NOW + 3600e3).toISOString() }
  ok(inviteDenial(live, client, NOW) === null, 'живое приглашение гасится')
  ok(inviteDenial(null, client, NOW) === 'missing', 'нет приглашения')
  ok(inviteDenial({ ...live, used_at: '2026-10-07T10:00:00Z' }, client, NOW) === 'used', 'повторное использование')
  ok(inviteDenial({ ...live, expires_at: new Date(NOW - 1).toISOString() }, client, NOW) === 'expired', 'истёк срок')
  ok(inviteDenial({ ...live, expires_at: 'garbage' }, client, NOW) === 'expired', 'битая дата = истёк')
  ok(inviteDenial(live, { ...client, archived_at: '2026-10-01' }, NOW) === 'client_inactive', 'клиент в архиве')
  ok(inviteDenial(live, { ...client, club_id: OTHER_CLUB }, NOW) === 'club_changed', 'клиент переехал в другой клуб')

  ok(clientSessionDenial({ session: { client_id: CLIENT, revoked_at: null }, client, clientId: CLIENT }) === null, 'живая сессия')
  ok(clientSessionDenial({ session: null, client, clientId: CLIENT }) === 'missing', 'сессии нет')
  ok(clientSessionDenial({ session: { client_id: 'other', revoked_at: null }, client, clientId: CLIENT }) === 'missing', 'сессия чужого клиента')
  ok(clientSessionDenial({ session: { client_id: CLIENT, revoked_at: 'x' }, client, clientId: CLIENT }) === 'revoked', 'отозвана')
  ok(clientSessionDenial({ session: { client_id: CLIENT }, client: { ...client, archived_at: 'x' }, clientId: CLIENT }) === 'client_inactive', 'архив гасит сессию')

  // --- Токены: клиент и сотрудник не взаимозаменяемы ---
  const cs = buildClientSession({ clientId: CLIENT, sid: 'sess-x' }, SECRET)
  ok(readClientToken(cs.access_token, CLIENT_TOKEN_TYP, SECRET)?.clientId === CLIENT, 'access клиента читается')
  ok(readClientToken(cs.refresh_token, CLIENT_TOKEN_TYP, SECRET) === null, 'refresh не годится как access')
  ok(readClientToken(cs.access_token, CLIENT_REFRESH_TYP, SECRET) === null, 'access не годится как refresh')
  ok(readClientToken(cs.access_token, CLIENT_TOKEN_TYP, `${SECRET}x`) === null, 'чужой секрет')
  const staff = buildOwnSession({ id: 'staff-1', email: 's@x', sid: 'sid-1' }, SECRET)
  ok(readClientToken(staff.access_token, CLIENT_TOKEN_TYP, SECRET) === null, 'токен сотрудника не открывает /me')
  ok(readClientToken(staff.refresh_token, CLIENT_REFRESH_TYP, SECRET) === null, 'refresh сотрудника не продлевает клиента')
  ok((await verifyBearerOwn(cs.access_token)).user === null, 'токен клиента не проходит verifyBearerOwn (API сотрудника)')
  ok((await verifyBearerOwn(cs.refresh_token)).user === null, 'refresh клиента не проходит verifyBearerOwn')
  const expired = buildClientSession({ clientId: CLIENT, sid: 's' }, SECRET, Math.floor(NOW / 1000) - 7200)
  ok(readClientToken(expired.access_token, CLIENT_TOKEN_TYP, SECRET) === null, 'истёкший access')

  // --- Права сотрудника на выдачу ---
  const row = { id: CLIENT, club_id: CLUB, trainer_id: TRAINER, archived_at: null }
  const trainerCtx = { isTrainer: true, user: { id: TRAINER }, profile: { club_id: CLUB } }
  ok(canStaffInviteClient(trainerCtx, row).ok, 'тренер — своему клиенту')
  ok(!canStaffInviteClient({ ...trainerCtx, user: { id: 'other' } }, row).ok, 'тренер — не своему: нет')
  ok(!canStaffInviteClient({ ...trainerCtx, profile: { club_id: OTHER_CLUB } }, row).ok, 'тренер другого клуба: нет')
  ok(canStaffInviteClient({ isSupervisor: true, profile: { club_id: CLUB } }, row).ok, 'управляющий своего клуба')
  ok(!canStaffInviteClient({ isSupervisor: true, profile: { club_id: OTHER_CLUB } }, row).ok, 'управляющий чужого клуба: нет')
  ok(!canStaffInviteClient({ isSupervisor: true, profile: { club_id: '' } }, { ...row, club_id: '' }).ok, 'пустой club_id не совпадает с пустым')
  ok(canStaffInviteClient({ isSalesManager: true, profile: { club_id: CLUB } }, row).ok, 'менеджер своего клуба')
  ok(canStaffInviteClient({ isAdmin: true }, row).ok, 'админ сети')
  ok(!canStaffInviteClient({ profile: { club_id: CLUB } }, row).ok, 'пустая роль: нет')
  ok(canStaffInviteClient({ isAdmin: true }, { ...row, archived_at: 'x' }).status === 409, 'архивный клиент: 409')
  ok(canStaffInviteClient({ isAdmin: true }, null).status === 404, 'нет клиента: 404')

  // --- Обработчик client-auth ---
  const store = memoryStore()
  const handler = createClientAuthHandler(store, createAuthFailLimiter({ perLoginIp: 3, perIp: 3, perLogin: Infinity }))
  const tk = newInviteToken()
  await store.createInvite({ clientId: CLIENT, clubId: CLUB, tokenHash: hashInviteToken(tk), expiresAt: new Date(Date.now() + 3600e3).toISOString() })
  const r1 = await call(handler, { action: 'redeem', token: tk })
  ok(r1.statusCode === 200 && r1.body?.session?.access_token, 'redeem выдаёт сессию')
  ok(r1.body?.client?.name === 'Иванова Анна' && Object.keys(r1.body.client).length === 1, 'в ответе только имя клиента')
  const r2 = await call(handler, { action: 'redeem', token: tk })
  ok(r2.statusCode === 401, 'вторая попытка той же ссылкой — 401')
  const rBad = await call(handler, JSON.stringify({ action: 'redeem', token: 'x'.repeat(32) }))
  ok(rBad.statusCode === 401, 'чужой токен — 401 (тело-строка)')

  const sess = r1.body.session
  const reqWith = (t) => ({ method: 'GET', headers: { authorization: `Bearer ${t}` } })
  let res = fakeRes()
  const ctx = await requireClientUser(reqWith(sess.access_token), res, store)
  ok(ctx?.clientId === CLIENT && ctx.client?.id === CLIENT, 'requireClientUser пускает свой токен')
  res = fakeRes()
  ok((await requireClientUser(reqWith(staff.access_token), res, store)) === null && res.statusCode === 401, 'токен сотрудника на /client-me — 401')

  const rr = await call(handler, { action: 'refresh', refresh_token: sess.refresh_token })
  ok(rr.statusCode === 200 && rr.body?.session?.access_token, 'refresh продлевает')
  ok((await call(handler, { action: 'refresh', refresh_token: sess.access_token })).statusCode === 401, 'refresh access-токеном — 401')

  store.clients.get(CLIENT).archived_at = '2026-10-07T00:00:00Z'
  res = fakeRes()
  ok((await requireClientUser(reqWith(sess.access_token), res, store)) === null, 'архив клиента сразу закрывает /me')
  ok((await call(handler, { action: 'refresh', refresh_token: sess.refresh_token })).statusCode === 401, 'архив — refresh 401')
  store.clients.get(CLIENT).archived_at = null

  ok((await call(handler, { action: 'logout', refresh_token: sess.refresh_token })).statusCode === 200, 'logout')
  res = fakeRes()
  ok((await requireClientUser(reqWith(sess.access_token), res, store)) === null, 'после logout access не работает')

  ok((await call(handler, { action: 'nope' })).statusCode === 400, 'неизвестное действие — 400')
  const ipHandler = createClientAuthHandler(memoryStore(), createAuthFailLimiter({ perLoginIp: 3, perIp: 3, perLogin: Infinity }))
  for (let i = 0; i < 3; i += 1) await call(ipHandler, { action: 'redeem', token: newInviteToken() }, '10.9.9.9')
  ok((await call(ipHandler, { action: 'redeem', token: newInviteToken() }, '10.9.9.9')).statusCode === 429, 'лимит по IP — 429')
  ok((await call(ipHandler, { action: 'redeem', token: newInviteToken() }, '10.9.9.8')).statusCode === 401, 'другой IP не заблокирован')

  delete process.env.JWT_SECRET
  res = fakeRes()
  ok((await requireClientUser(reqWith(sess.access_token), res, store)) === null && res.statusCode === 503, 'без JWT_SECRET — 503')
} finally {
  if (prevSecret == null) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = prevSecret
}

if (failed) {
  console.error(`\nverify-client-auth: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-auth: OK')
