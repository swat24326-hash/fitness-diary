import { createServiceDataClient } from '../pgRest/serviceClient.js'

const TABLE = 'device_health'
const COLS =
  'id, user_id, device_id, club_id, label, bundle_id, problems, server_problems, queue_count, last_report_at, last_pull_ok_at, problem_since, notified_at, notified_codes, resolved_at, resolved_codes, created_at'

function result(res) {
  return { data: res.data ?? null, error: res.error?.message ?? null }
}

/** Хранилище device_health (только сервер). Подменяется в verify через deps. */
export function createDeviceHealthStore(db = createServiceDataClient()) {
  return {
    async get(userId, deviceId) {
      return result(await db.from(TABLE).select(COLS).eq('user_id', userId).eq('device_id', deviceId).maybeSingle())
    },

    async listById(id) {
      const res = await db.from(TABLE).select(COLS).eq('id', id).limit(1)
      return { rows: res.data ?? [], error: res.error?.message ?? null }
    },

    /** Вставка или обновление строки устройства целиком (ключ user_id + device_id). */
    async upsert(row) {
      return result(await db.from(TABLE).upsert(row, { onConflict: 'user_id,device_id' }).select('id'))
    },

    /** Успешный trainer-pull с этого устройства; club_id не затираем пустым. */
    async markPullOk(userId, deviceId, clubId, atIso) {
      const row = { user_id: userId, device_id: deviceId, last_pull_ok_at: atIso, ...(clubId ? { club_id: clubId } : {}) }
      return result(await db.from(TABLE).upsert(row, { onConflict: 'user_id,device_id' }).select('id'))
    },

    async update(id, patch) {
      return result(await db.from(TABLE).update(patch).eq('id', id).select('id'))
    },

    async listRecent(sinceIso, limit = 2000) {
      const res = await db.from(TABLE).select(COLS).gte('last_report_at', sinceIso).order('last_report_at', { ascending: false }).limit(limit)
      return { rows: res.data ?? [], error: res.error?.message ?? null }
    },
  }
}
