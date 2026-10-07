import { createServiceDataClient } from '../pgRest/serviceClient.js'

const CLIENT_FIELDS = 'id, name, club_id, trainer_id, archived_at'

/** Доступ к client_invites / client_sessions / clients для входа клиента. Подменяется в verify. */
export const clientPortalStore = {
  async loadClient(clientId) {
    const { data, error } = await createServiceDataClient()
      .from('clients')
      .select(CLIENT_FIELDS)
      .eq('id', clientId)
      .maybeSingle()
    if (error) throw error
    return data ?? null
  },

  async createInvite({ clientId, clubId, tokenHash, createdBy, expiresAt }) {
    const db = createServiceDataClient()
    const nowIso = new Date().toISOString()
    // Новое приглашение гасит прежние неиспользованные: живёт одна последняя ссылка.
    const closed = await db
      .from('client_invites')
      .update({ expires_at: nowIso })
      .eq('client_id', clientId)
      .is('used_at', null)
      .gt('expires_at', nowIso)
    if (closed.error) throw closed.error
    const { error } = await db.from('client_invites').insert({
      client_id: clientId,
      club_id: clubId,
      token_hash: tokenHash,
      created_by: createdBy,
      expires_at: expiresAt,
    })
    if (error) throw error
  },

  /** Приглашение для значка на iPhone: гасит только прежние такие же, ссылку из клуба не трогает. */
  async createHandoffInvite({ clientId, clubId, tokenHash, expiresAt }) {
    const db = createServiceDataClient()
    const nowIso = new Date().toISOString()
    const closed = await db
      .from('client_invites')
      .update({ expires_at: nowIso })
      .eq('client_id', clientId)
      .is('created_by', null)
      .is('used_at', null)
      .gt('expires_at', nowIso)
    if (closed.error) throw closed.error
    const { error } = await db.from('client_invites').insert({
      client_id: clientId,
      club_id: clubId,
      token_hash: tokenHash,
      created_by: null,
      expires_at: expiresAt,
    })
    if (error) throw error
  },

  async loadInviteByHash(tokenHash) {
    const { data, error } = await createServiceDataClient()
      .from('client_invites')
      .select('id, client_id, club_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (error) throw error
    return data ?? null
  },

  /** Гасит приглашение ровно один раз (гонка двух вкладок → второй получит false). */
  async markInviteUsed(inviteId) {
    const { data, error } = await createServiceDataClient()
      .from('client_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', inviteId)
      .is('used_at', null)
      .select('id')
    if (error) throw error
    return Array.isArray(data) && data.length === 1
  },

  async createSession(clientId, inviteId) {
    const { data, error } = await createServiceDataClient()
      .from('client_sessions')
      .insert({ client_id: clientId, invite_id: inviteId })
      .select('id')
      .single()
    if (error) throw error
    return String(data.id)
  },

  async loadSession(sid) {
    const { data, error } = await createServiceDataClient()
      .from('client_sessions')
      .select('id, client_id, revoked_at')
      .eq('id', sid)
      .maybeSingle()
    if (error) throw error
    return data ?? null
  },

  async touchSession(sid) {
    await createServiceDataClient()
      .from('client_sessions')
      .update({ last_refresh_at: new Date().toISOString() })
      .eq('id', sid)
  },

  async revokeSession(sid, clientId) {
    const { error } = await createServiceDataClient()
      .from('client_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sid)
      .eq('client_id', clientId)
      .is('revoked_at', null)
    if (error) throw error
  },

  /** «Отключить все входы»: телефон потерян / сменился. Закрывает и открытые приглашения. */
  async revokeAllForClient(clientId) {
    const db = createServiceDataClient()
    const nowIso = new Date().toISOString()
    const s = await db
      .from('client_sessions')
      .update({ revoked_at: nowIso })
      .eq('client_id', clientId)
      .is('revoked_at', null)
    if (s.error) throw s.error
    const i = await db
      .from('client_invites')
      .update({ expires_at: nowIso })
      .eq('client_id', clientId)
      .is('used_at', null)
      .gt('expires_at', nowIso)
    if (i.error) throw i.error
  },
}
