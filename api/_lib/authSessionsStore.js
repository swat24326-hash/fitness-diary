import { createServiceDataClient } from './pgRest/serviceClient.js'

/** Хранилище auth_sessions. Подменяется в verify через deps. */
export const authSessionsStore = {
  /**
   * device_id пишем только при включённой привязке устройств: без миграции 20261010120000 колонки нет.
   * @returns {Promise<{ sid: string | null, error: string | null }>}
   */
  async create(userId, deviceId = null) {
    const { data, error } = await createServiceDataClient()
      .from('auth_sessions')
      .insert({ user_id: userId, ...(deviceId ? { device_id: deviceId } : {}) })
      .select('id')
      .single()
    if (error || !data?.id) return { sid: null, error: error?.message || 'auth_sessions insert failed' }
    return { sid: String(data.id), error: null }
  },

  /**
   * @param {string} sid
   * @param {{ withDevice?: boolean }} [opts]
   * @returns {Promise<{ row: object | null, error: string | null }>}
   */
  async load(sid, opts = {}) {
    const cols = opts.withDevice ? 'id, user_id, revoked_at, device_id, created_at' : 'id, user_id, revoked_at'
    const { data, error } = await createServiceDataClient().from('auth_sessions').select(cols).eq('id', sid).maybeSingle()
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

  async bindDevice(sid, deviceId) {
    const { error } = await createServiceDataClient().from('auth_sessions').update({ device_id: deviceId }).eq('id', sid)
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

  async revokeForDevices(userId, deviceIds) {
    if (!deviceIds.length) return { error: null }
    const { error } = await createServiceDataClient()
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('device_id', deviceIds)
      .is('revoked_at', null)
    return { error: error?.message ?? null }
  },
}
