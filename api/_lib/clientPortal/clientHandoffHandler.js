/**
 * POST /api/client-me { action: 'handoff' } → { token, expires_at } — одноразовый вход для значка на iPhone.
 * Только после requireClientUser: приглашение на себя же, в свой клуб.
 */
import { sendJson } from '../adminSupabase.js'
import { hashInviteToken, newInviteToken } from './clientAuthCore.js'
import { CLIENT_HANDOFF_TTL_MS } from './clientHandoffCore.js'
import { clientPortalStore } from './clientPortalStore.js'

export async function handleClientHandoff(ctx, res, store = clientPortalStore, nowMs = Date.now()) {
  const clubId = ctx.client?.club_id
  if (!clubId) {
    sendJson(res, 409, { error: 'Клиент не привязан к клубу' })
    return
  }
  const token = newInviteToken()
  const expiresAt = new Date(nowMs + CLIENT_HANDOFF_TTL_MS).toISOString()
  await store.createHandoffInvite({ clientId: ctx.clientId, clubId, tokenHash: hashInviteToken(token), expiresAt })
  sendJson(res, 200, { token, expires_at: expiresAt })
}
