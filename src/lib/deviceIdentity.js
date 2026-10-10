import { deviceRequestHeaders, readOrCreateDeviceId } from './deviceIdentityCore.js'

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

/** Номер этого браузера / PWA; уходит заголовком x-device-id на вход и продление сессии. */
export const deviceId = readOrCreateDeviceId(typeof localStorage === 'undefined' ? null : localStorage, randomId)

/** Заголовки входа и продления: номер устройства + признак сенсора для подписи у админа. */
export const deviceHeaders = deviceRequestHeaders(deviceId, typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints)
