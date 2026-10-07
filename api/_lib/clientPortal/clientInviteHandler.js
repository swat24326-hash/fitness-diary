/**
 * POST /api/client-invite { client_id, action?: 'create' | 'revoke' } — только сотрудник.
 * create → { token, expires_at }: ссылку /me/join#t=… собирает фронт от своего origin.
 * revoke → отключить все входы клиента и неиспользованные ссылки.
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
    if (!clientPortalSecret()) {
      sendJson(res, 503, { error: 'Вход клиентов не настроен на сервере' })
      return
    }
    const body = parseBody(req.body)
    const clientId = String(body.client_id ?? '').trim()
    if (!isUuid(clientId)) {
      sendJson(res, 400, { error: 'Не указан клиент' })
      return
    }
    const client = await store.loadClient(clientId)
    const gate = canStaffInviteClient(ctx, client)
    if (!gate.ok) {
      sendJson(res, gate.status, { error: gate.error })
      return
    }
    if (body.action === 'revoke') {
      await store.revokeAllForClient(clientId)
      sendJson(res, 200, { ok: true })
      return
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
    sendJson(res, 200, { token, expires_at: expiresAt })
  }
}
