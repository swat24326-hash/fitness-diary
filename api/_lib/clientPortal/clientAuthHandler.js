/**
 * POST /api/client-auth { action: 'redeem' | 'refresh' | 'logout', token? , refresh_token? }
 * Без Bearer: вход с улицы. Перебор бессмыслен (192 бита), но лимит по IP всё равно держим.
 */
import { sendJson, setCors } from '../adminSupabase.js'
import { clientIpFromHeaders, createAuthFailLimiter } from '../authRateLimitCore.js'
import {
  CLIENT_INVITE_BAD_RU,
  CLIENT_REFRESH_TYP,
  CLIENT_SESSION_RU,
  buildClientSession,
  clientPortalSecret,
  clientSessionDenial,
  hashInviteToken,
  inviteDenial,
  readClientToken,
} from './clientAuthCore.js'
import { clientPortalStore } from './clientPortalStore.js'

const REDEEM_KEY = 'client-invite'
// Общий счётчик «логина» выключен: иначе чужой перебор закрыл бы вход всем клиентам.
const redeemLimiter = createAuthFailLimiter({ perLoginIp: 10, perIp: 10, perLogin: Number.POSITIVE_INFINITY })

function parseBody(body) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

async function redeem(res, body, secret, store) {
  const tokenHash = hashInviteToken(body.token)
  const invite = tokenHash ? await store.loadInviteByHash(tokenHash) : null
  const client = invite ? await store.loadClient(invite.client_id) : null
  const denial = inviteDenial(invite, client)
  if (denial) {
    if (denial !== 'missing') console.warn('[client-auth] redeem denied:', denial)
    sendJson(res, 401, { error: CLIENT_INVITE_BAD_RU })
    return
  }
  if (!(await store.markInviteUsed(invite.id))) {
    sendJson(res, 401, { error: CLIENT_INVITE_BAD_RU })
    return
  }
  const sid = await store.createSession(client.id, invite.id)
  sendJson(res, 200, {
    session: buildClientSession({ clientId: client.id, sid }, secret),
    client: { name: String(client.name ?? '') },
  })
}

async function refresh(res, body, secret, store) {
  const tok = readClientToken(body.refresh_token, CLIENT_REFRESH_TYP, secret)
  if (!tok) {
    sendJson(res, 401, { error: CLIENT_SESSION_RU })
    return
  }
  const [session, client] = await Promise.all([store.loadSession(tok.sid), store.loadClient(tok.clientId)])
  if (clientSessionDenial({ session, client, clientId: tok.clientId })) {
    sendJson(res, 401, { error: CLIENT_SESSION_RU })
    return
  }
  store.touchSession(tok.sid).catch(() => {})
  sendJson(res, 200, { session: buildClientSession(tok, secret) })
}

async function logout(res, body, secret, store) {
  const tok = readClientToken(body.refresh_token, CLIENT_REFRESH_TYP, secret)
  if (tok) await store.revokeSession(tok.sid, tok.clientId)
  sendJson(res, 200, { ok: true })
}

export function createClientAuthHandler(store = clientPortalStore, limiter = redeemLimiter) {
  return async function clientAuthHandler(req, res) {
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
    const secret = clientPortalSecret()
    if (!secret) {
      sendJson(res, 503, { error: 'Вход клиентов не настроен на сервере' })
      return
    }
    const body = parseBody(req.body)
    const action = String(body.action ?? '')
    if (action === 'refresh') return refresh(res, body, secret, store)
    if (action === 'logout') return logout(res, body, secret, store)
    if (action !== 'redeem') {
      sendJson(res, 400, { error: 'Неизвестное действие' })
      return
    }
    const ip = clientIpFromHeaders(req.headers, req.remoteAddress ?? req.socket?.remoteAddress)
    const gate = limiter.check(REDEEM_KEY, ip)
    if (!gate.ok) {
      res.setHeader('Retry-After', String(gate.retryAfterSec))
      sendJson(res, 429, { error: 'Слишком много попыток. Подождите несколько минут.' })
      return
    }
    await redeem(res, body, secret, store)
    limiter.recordOutcome(REDEEM_KEY, ip, res.statusCode)
  }
}
