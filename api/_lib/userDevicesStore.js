import { createServiceDataClient } from './pgRest/serviceClient.js'

const COLS = 'id, user_id, device_id, status, label, created_at, decided_at, last_seen_at'

/** Хранилище user_devices (только сервер). Подменяется в verify через deps. */
export const userDevicesStore = {
  /** @returns {Promise<{ rows: object[], error: string | null }>} */
  async listForUser(userId) {
    const { data, error } = await createServiceDataClient().from('user_devices').select(COLS).eq('user_id', userId)
    return { rows: data ?? [], error: error?.message ?? null }
  },

  /** @returns {Promise<{ row: object | null, error: string | null }>} */
  async get(id) {
    const { data, error } = await createServiceDataClient().from('user_devices').select(COLS).eq('id', id).maybeSingle()
    return { row: data ?? null, error: error?.message ?? null }
  },

  /** @returns {Promise<{ rows: object[], error: string | null }>} */
  async listForAdmin() {
    const { data, error } = await createServiceDataClient()
      .from('user_devices')
      .select(COLS)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(2000)
    return { rows: data ?? [], error: error?.message ?? null }
  },

  async insert({ userId, deviceId, status, label }) {
    const now = new Date().toISOString()
    const { error } = await createServiceDataClient()
      .from('user_devices')
      .insert({
        user_id: userId,
        device_id: deviceId,
        status,
        label,
        last_seen_at: now,
        ...(status === 'approved' ? { decided_at: now } : {}),
      })
    return { error: error?.message ?? null }
  },

  async setStatus(id, status, decidedBy = null) {
    const { error } = await createServiceDataClient()
      .from('user_devices')
      .update({ status, decided_at: new Date().toISOString(), decided_by: decidedBy })
      .eq('id', id)
    return { error: error?.message ?? null }
  },

  async touch(id) {
    const { error } = await createServiceDataClient()
      .from('user_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', id)
    return { error: error?.message ?? null }
  },
}
