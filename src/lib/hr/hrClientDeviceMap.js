/**
 * Привязка clientId → deviceId на этом планшете (localStorage).
 */

const PREFIX = 'fitness-diary-hr-client-device-v1:'

/**
 * @param {string | null | undefined} trainerUserId
 */
export function hrClientDeviceMapKey(trainerUserId) {
  return `${PREFIX}${String(trainerUserId ?? '').trim() || 'anon'}`
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function parseHrClientDeviceMap(raw) {
  let o = raw
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
  /** @type {Record<string, string>} */
  const out = {}
  for (const [k, v] of Object.entries(o)) {
    const cid = String(k ?? '').trim()
    const did = String(v ?? '').trim()
    if (cid && did) out[cid] = did
  }
  return out
}

/**
 * @param {string | null | undefined} trainerUserId
 * @returns {Record<string, string>}
 */
export function readHrClientDeviceMap(trainerUserId) {
  if (typeof localStorage === 'undefined') return {}
  const uid = String(trainerUserId ?? '').trim()
  if (!uid) return {}
  try {
    const raw = localStorage.getItem(hrClientDeviceMapKey(uid))
    if (!raw) return {}
    return parseHrClientDeviceMap(raw)
  } catch {
    return {}
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 * @returns {string | null}
 */
export function readDeviceIdForClient(trainerUserId, clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return null
  return readHrClientDeviceMap(trainerUserId)[cid] ?? null
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 * @param {string | null | undefined} deviceId
 */
export function writeDeviceIdForClient(trainerUserId, clientId, deviceId) {
  if (typeof localStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  const did = String(deviceId ?? '').trim()
  if (!uid || !cid || !did) return
  try {
    const map = readHrClientDeviceMap(uid)
    map[cid] = did
    localStorage.setItem(hrClientDeviceMapKey(uid), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} clientId
 */
export function clearDeviceIdForClient(trainerUserId, clientId) {
  if (typeof localStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  const cid = String(clientId ?? '').trim()
  if (!uid || !cid) return
  try {
    const map = readHrClientDeviceMap(uid)
    if (!(cid in map)) return
    delete map[cid]
    localStorage.setItem(hrClientDeviceMapKey(uid), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
