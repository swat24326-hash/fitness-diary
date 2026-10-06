import { createServiceDataClient } from './pgRest/serviceClient.js'

/** Хранилище auth_sessions. Подменяется в verify через deps. */
export const authSessionsStore = {
  /** @returns {Promise<{ sid: string | null, error: string | null }>} */
  async create(userId) {
    const { data, error } = await createServiceDataClient()
      .from('auth_sessions')
      .insert({ user_id: userId })
      .select('id')
      .single()
    if (error || !data?.id) return { sid: null, error: error?.message || 'auth_sessions insert failed' }
    return { sid: String(data.id), error: null }
  },

  /** @returns {Promise<{ row: object | null, error: string | null }>} */
  async load(sid) {
    const { data, error } = await createServiceDataClient()
      .from('auth_sessions')
      .select('id, user_id, revoked_at')
      .eq('id', sid)
      .maybeSingle()
    if (error) return { row: null, error: error.message || 'Не удалось проверить сессию' }
    return { row: data ?? null, error: null }
  },

  async touch(sid) {
    const { error } = await createServiceDataClient()
      .from('auth_sessions')
      .update({ last_refresh_at: new Date().toISOString() })
      .eq('id', sid)
    return { error: error?.message ?? null }
  },

  async revoke(sid, userId) {
    const { error } = await createServiceDataClient()
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sid)
      .eq('user_id', userId)
      .is('revoked_at', null)
    return { error: error?.message ?? null }
  },

  async revokeAllForUser(userId) {
    const { error } = await createServiceDataClient()
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null)
    return { error: error?.message ?? null }
  },
}
