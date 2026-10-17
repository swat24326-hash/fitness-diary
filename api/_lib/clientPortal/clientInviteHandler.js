/**
 * POST /api/client-invite { client_id, action?: 'create' | 'revoke' | 'status' } — только сотрудник.
 * create → { token, expires_at }: ссылку /me/join#t=… собирает фронт от своего origin.
 * revoke → отключить все входы клиента и неиспользованные ссылки.
 * status → { has_app }: есть ли живой вход в /me (для конвертика в карточке).
 */
import { isUuid } from '../mutationAuth.js'
import { requireAuthUser, sendJson, setCors } from '../adminSupabase.js'
import { CLIENT_INVITE_TTL_MS, clientPortalSecret, hashInviteToken, newInviteToken } from './clientAuthCore.js'
import { canStaffInviteClient } from './clientInviteCore.js'
import { clientPortalStore } from './clientPortalStore.js'

function parseBody(body) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

/**
 * Выдать ссылку, статус входа или отключить входы — общее для /api/client-invite и телефона тренера (/api/coach op client-invite).
 * @param {object} ctx requireAuthUser / requireCoachUser
 * @param {{ client_id?: string, action?: string }} body
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function issueClientInvite(ctx, body, store = clientPortalStore) {
  const clientId = String(body?.client_id ?? '').trim()
  if (!isUuid(clientId)) return { status: 400, body: { error: 'Не указан клиент' } }
  const client = await store.loadClient(clientId)
  const gate = canStaffInviteClient(ctx, client)
  if (!gate.ok) return { status: gate.status, body: { error: gate.error } }
  if (body?.action === 'status') {
    const hasApp = typeof store.hasLiveSession === 'function' ? await store.hasLiveSession(clientId) : false
    return { status: 200, body: { has_app: Boolean(hasApp) } }
  }
  if (!clientPortalSecret()) return { status: 503, body: { error: 'Вход клиентов не настроен на сервере' } }
  if (body?.action === 'revoke') {
    await store.revokeAllForClient(clientId)
    return { status: 200, body: { ok: true } }
  }
  const token = newInviteToken()
  const expiresAt = new Date(Date.now() + CLIENT_INVITE_TTL_MS).toISOString()
  await store.createInvite({
    clientId,
    clubId: client.club_id,
    tokenHash: hashInviteToken(token),
    createdBy: ctx.user.id,
    expiresAt,
  })
  return { status: 200, body: { token, expires_at: expiresAt } }
}

export function createClientInviteHandler(store = clientPortalStore) {
  return async function clientInviteHandler(req, res) {
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
    const ctx = await requireAuthUser(req, res)
    if (!ctx) return
    const out = await issueClientInvite(ctx, parseBody(req.body), store)
    sendJson(res, out.status, out.body)
  }
}
