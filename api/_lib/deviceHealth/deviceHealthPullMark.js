import { deviceIdFromHeaders } from '../deviceBindingGate.js'
import { createDeviceHealthStore } from './deviceHealthStore.js'

/**
 * Успешный trainer-pull → device_health.last_pull_ok_at (для server_no_pull). Без ожидания и без влияния на ответ:
 * сбой записи не должен ломать загрузку данных тренеру.
 */
export function markDevicePullOk(req, userId, clubId, store = createDeviceHealthStore()) {
  const deviceId = deviceIdFromHeaders(req?.headers)
  if (!deviceId || !userId) return
  store
    .markPullOk(String(userId), deviceId, clubId || null, new Date().toISOString())
    .then((r) => {
      if (r.error) console.warn('[device-health] pull mark:', r.error)
    })
    .catch((e) => console.warn('[device-health] pull mark:', e?.message || e))
}
