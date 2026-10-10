import {
  decideRefreshDevice,
  decideSignInDevice,
  deviceBindingWindow,
  deviceDenialMessageRu,
  deviceLabelFromUserAgent,
  isDeviceBoundRole,
  normalizeDeviceId,
} from './deviceBindingCore.js'
import { notifyAdminsPendingDevice } from './deviceBindingNotify.js'
import { userDevicesStore } from './userDevicesStore.js'

const BUSY_RU = 'Сервер занят — повторите через минуту'

/** Привязка включена сейчас (env DEVICE_BINDING_SINCE). */
export function deviceBindingNow(now = Date.now()) {
  return deviceBindingWindow(process.env.DEVICE_BINDING_SINCE, now)
}

/** Номер устройства из заголовка запроса (клиент шлёт на вход и на продление). */
export function deviceIdFromHeaders(headers) {
  return normalizeDeviceId(headers?.['x-device-id'] ?? headers?.['X-Device-Id'])
}

async function applyDecision(decision, { userId, deviceId, userAgent, store, notify }) {
  if (decision.register) {
    const { error } = await store.insert({
      userId,
      deviceId,
      status: decision.register,
      label: deviceLabelFromUserAgent(userAgent),
    })
    if (error) return { error }
  }
  if (decision.setStatus && decision.deviceRowId) {
    const { error } = await store.setStatus(decision.deviceRowId, decision.setStatus)
    if (error) return { error }
  }
  if (decision.deviceRowId && decision.allow) store.touch(decision.deviceRowId).catch(() => {})
  if (!decision.allow && (decision.register === 'pending' || decision.setStatus === 'pending')) {
    notify(userId, deviceLabelFromUserAgent(userAgent)).catch((e) => console.warn('[device-binding] notify:', e?.message || e))
  }
  return { error: null }
}

/**
 * Вход по паролю. sessionDeviceId — что записать в auth_sessions (null, пока привязка выключена).
 * @returns {Promise<{ allow: true, sessionDeviceId: string | null } | { allow: false, error: string, code: string, transient?: boolean }>}
 */
export async function gateSignInDevice(
  { userId, role, deviceId, userAgent, now = Date.now() },
  { store = userDevicesStore, notify = notifyAdminsPendingDevice } = {},
) {
  const window = deviceBindingNow(now)
  if (!window.active || !isDeviceBoundRole(role)) return { allow: true, sessionDeviceId: null }
  const { rows, error } = await store.listForUser(userId)
  if (error) return { allow: false, error: BUSY_RU, code: 'busy', transient: true }
  const decision = decideSignInDevice({ role, deviceId, devices: rows, window })
  const applied = await applyDecision(decision, { userId, deviceId, userAgent, store, notify })
  if (applied.error) {
    console.warn('[device-binding] sign-in:', applied.error)
    return { allow: false, error: BUSY_RU, code: 'busy', transient: true }
  }
  if (!decision.allow) {
    return { allow: false, error: deviceDenialMessageRu(decision.reason), code: decision.reason === 'no_device' ? 'device_update' : 'device_pending' }
  }
  return { allow: true, sessionDeviceId: decision.bind ?? null }
}

/**
 * Продление сессии. bindDevice — привязать устройство к сессии, выданной без него.
 * @returns {Promise<{ allow: true, bindDevice: string | null } | { allow: false, error: string, transient?: boolean }>}
 */
export async function gateRefreshDevice(
  { userId, role, session, headerDeviceId, userAgent, now = Date.now() },
  { store = userDevicesStore, notify = notifyAdminsPendingDevice } = {},
) {
  const window = deviceBindingNow(now)
  if (!window.active || !isDeviceBoundRole(role)) return { allow: true, bindDevice: null }
  const { rows, error } = await store.listForUser(userId)
  if (error) return { allow: false, error: BUSY_RU, transient: true }
  const decision = decideRefreshDevice({ role, session, headerDeviceId, devices: rows, window })
  const applied = await applyDecision(decision, { userId, deviceId: headerDeviceId, userAgent, store, notify })
  if (applied.error) {
    console.warn('[device-binding] refresh:', applied.error)
    return { allow: false, error: BUSY_RU, transient: true }
  }
  if (!decision.allow) return { allow: false, error: deviceDenialMessageRu(decision.reason) }
  return { allow: true, bindDevice: decision.bind && !session?.device_id ? decision.bind : null }
}
