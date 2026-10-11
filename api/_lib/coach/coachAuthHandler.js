/**
 * POST /api/coach-auth { action: 'sign-in' | 'redeem' | 'refresh' | 'sign-out' | 'invite', ... },
 * заголовок x-device-id = номер телефона (coach-…). Без Bearer: вход с улицы (лимиты — общие с /api/auth-sign-in,
 * текст ошибки не говорит, есть ли такой логин). Исключение — invite: QR выдаёт тренер с планшета по своему Bearer.
 */
import { sendJson, setCors } from '../adminSupabase.js'
import { isOwnAuthProvider, verifyOwnPassword } from '../authOwnCore.js'
import { normalizeLoginInput, normalizePasswordInput } from '../authLoginResolveCore.js'
import { authFailLimiter, authRateLimitedMessageRu, clientIpFromHeaders, createAuthFailLimiter } from '../authRateLimitCore.js'
import { decideCoachDevice, isCoachDeviceId } from '../deviceBindingCore.js'
import { deviceIdFromHeaders } from '../deviceBindingGate.js'
import { admitCoachPhone, coachDeviceLabel } from './coachAdmit.js'
import {
  COACH_BLOCKED_RU,
  COACH_INVALID_RU,
  COACH_ONLY_TRAINER_RU,
  COACH_REFRESH_TYP,
  COACH_SESSION_RU,
  buildCoachSession,
  coachAccessDenial,
  coachSecret,
  readCoachToken,
} from './coachAuthCore.js'
import { issueCoachInvite, redeemCoachInvite } from './coachInviteHandler.js'
import { coachStore } from './coachStore.js'

const QR_KEY = 'coach-invite'
// Общий счётчик «логина» выключен: иначе чужой перебор закрыл бы QR всем тренерам.
const qrLimiter = createAuthFailLimiter({ perLoginIp: 10, perIp: 10, perLogin: Number.POSITIVE_INFINITY })

const UNAVAILABLE_RU = 'Приложение на телефоне скоро будет доступно'

function parseBody(body) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

async function signIn(req, res, body, env) {
  const deviceId = deviceIdFromHeaders(req.headers)
  if (!isCoachDeviceId(deviceId)) {
    sendJson(res, 400, { error: 'Обновите страницу и войдите снова', code: 'device_update' })
    return
  }
  const password = normalizePasswordInput(body.password)
  const user = password ? await env.store.findUserByLogin(body.login) : null
  if (!user?.id || !(await verifyOwnPassword(password, user.password_hash))) {
    sendJson(res, 401, { error: COACH_INVALID_RU })
    return
  }
  await admitCoachPhone({ req, res, user, deviceId }, env)
}

async function refresh(req, res, body, { secret, store }) {
  const tok = readCoachToken(body.refresh_token, COACH_REFRESH_TYP, secret)
  if (!tok) {
    sendJson(res, 401, { error: COACH_SESSION_RU })
    return
  }
  const [user, session] = await Promise.all([store.loadUser(tok.userId), store.loadSession(tok.sid)])
  const denial = coachAccessDenial({ user, session, userId: tok.userId, deviceId: tok.deviceId })
  if (denial) {
    sendJson(res, 401, { error: denial === 'blocked' ? COACH_BLOCKED_RU : denial === 'role' ? COACH_ONLY_TRAINER_RU : COACH_SESSION_RU })
    return
  }
  // Продление не ставит телефон в очередь заново: отозванный админом остаётся отозванным.
  const { rows, error } = await store.devices.listForUser(tok.userId)
  if (error) {
    sendJson(res, 503, { error: 'Сервер занят — повторите через минуту', code: 'busy' })
    return
  }
  const device = decideCoachDevice({ deviceId: tok.deviceId, devices: rows })
  if (!device.allow) {
    sendJson(res, 401, { error: COACH_SESSION_RU })
    return
  }
  store.devices.touch(device.deviceRowId, coachDeviceLabel(req.headers)).catch(() => {})
  store.touchSession(tok.sid).catch(() => {})
  sendJson(res, 200, { session: buildCoachSession(tok, secret), user: { name: String(user.name ?? '') } })
}

async function signOut(res, body, { secret, store }) {
  const tok = readCoachToken(body.refresh_token, COACH_REFRESH_TYP, secret)
  if (tok) await store.revokeSession(tok.sid, tok.userId)
  sendJson(res, 200, { ok: true })
}

/**
 * @param {{ store?: typeof coachStore, limiter?: typeof authFailLimiter, qrLimiter?: typeof authFailLimiter, deviceDeps?: Parameters<typeof import('../deviceBindingGate.js').gateCoachDevice>[1], ownAuth?: () => boolean, auth?: typeof import('../adminSupabase.js').requireAuthUser }} [deps]
 */
export function createCoachAuthHandler(deps = {}) {
  const store = deps.store ?? coachStore
  const limiter = deps.limiter ?? authFailLimiter
  const redeemLimiter = deps.qrLimiter ?? qrLimiter
  const ownAuth = deps.ownAuth ?? isOwnAuthProvider
  return async function coachAuthHandler(req, res) {
    setCors(res, 'POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const secret = coachSecret()
    if (!secret || !ownAuth()) {
      sendJson(res, 503, { error: UNAVAILABLE_RU })
      return
    }
    const body = parseBody(req.body)
    const action = String(body.action ?? '')
    const env = { secret, store, deviceDeps: deps.deviceDeps }
    if (action === 'refresh') return refresh(req, res, body, env)
    if (action === 'sign-out') return signOut(res, body, env)
    if (action === 'invite') return issueCoachInvite(req, res, { store, ...(deps.auth ? { auth: deps.auth } : {}) })
    const ip = clientIpFromHeaders(req.headers, req.remoteAddress ?? req.socket?.remoteAddress)
    if (action === 'redeem') {
      const qrGate = redeemLimiter.check(QR_KEY, ip)
      if (!qrGate.ok) {
        res.setHeader('Retry-After', String(qrGate.retryAfterSec))
        sendJson(res, 429, { error: authRateLimitedMessageRu(qrGate.retryAfterSec) })
        return
      }
      await redeemCoachInvite(req, res, body, env)
      redeemLimiter.recordOutcome(QR_KEY, ip, res.statusCode)
      return
    }
    if (action !== 'sign-in') {
      sendJson(res, 400, { error: 'Неизвестное действие' })
      return
    }
    const login = normalizeLoginInput(body.login)
    const gate = limiter.check(login, ip)
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      sendJson(res, 429, { error: authRateLimitedMessageRu(gate.retryAfterSec) })
      return
    }
    await signIn(req, res, body, env)
    limiter.recordOutcome(login, ip, res.statusCode)
  }
}
