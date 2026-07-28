/**
 * Запомненный BLE-датчик пульса на этом планшете (не Sync / не облако).
 * deviceId Web Bluetooth привязан к origin и браузеру.
 */

const STORAGE_PREFIX = 'fitness-diary-hr-device-v1:'

/**
 * @param {string | null | undefined} trainerUserId
 * @returns {string}
 */
export function rememberedHrDeviceStorageKey(trainerUserId) {
  const id = String(trainerUserId ?? '').trim()
  return `${STORAGE_PREFIX}${id || 'anon'}`
}

/**
 * @param {unknown} raw
 * @returns {{ deviceId: string, name: string, savedAt: number } | null}
 */
export function parseRememberedHrDevice(raw) {
  let o = raw
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!o || typeof o !== 'object') return null
  const deviceId = String(o.deviceId ?? '').trim()
  if (!deviceId) return null
  const name = String(o.name ?? '').trim() || 'Пульсометр'
  const savedAt = Number(o.savedAt)
  return {
    deviceId,
    name,
    savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : 0,
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @returns {{ deviceId: string, name: string, savedAt: number } | null}
 */
export function readRememberedHrDevice(trainerUserId) {
  if (typeof localStorage === 'undefined') return null
  const uid = String(trainerUserId ?? '').trim()
  if (!uid) return null
  try {
    const raw = localStorage.getItem(rememberedHrDeviceStorageKey(uid))
    if (!raw) return null
    return parseRememberedHrDevice(raw)
  } catch {
    return null
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {{ deviceId?: string, name?: string } | null | undefined} device
 */
export function writeRememberedHrDevice(trainerUserId, device) {
  if (typeof localStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  if (!uid || !device?.deviceId) return
  try {
    localStorage.setItem(
      rememberedHrDeviceStorageKey(uid),
      JSON.stringify({
        deviceId: String(device.deviceId).trim(),
        name: String(device.name ?? '').trim() || 'Пульсометр',
        savedAt: Date.now(),
      }),
    )
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 */
export function clearRememberedHrDevice(trainerUserId) {
  if (typeof localStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  if (!uid) return
  try {
    localStorage.removeItem(rememberedHrDeviceStorageKey(uid))
  } catch {
    /* ignore */
  }
}
