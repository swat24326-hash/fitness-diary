/**
 * Запомненные BLE-датчики пульса на этом планшете (до 2, не Sync).
 * deviceId Web Bluetooth привязан к origin и браузеру.
 */

import { HR_MAX_SLOTS } from './hrSessionsCore.js'

const STORAGE_PREFIX = 'fitness-diary-hr-devices-v2:'
/** @deprecated legacy single-device key */
const STORAGE_PREFIX_V1 = 'fitness-diary-hr-device-v1:'

/**
 * @param {string | null | undefined} trainerUserId
 * @returns {string}
 */
export function rememberedHrDevicesStorageKey(trainerUserId) {
  const id = String(trainerUserId ?? '').trim()
  return `${STORAGE_PREFIX}${id || 'anon'}`
}

/** @deprecated */
export function rememberedHrDeviceStorageKey(trainerUserId) {
  const id = String(trainerUserId ?? '').trim()
  return `${STORAGE_PREFIX_V1}${id || 'anon'}`
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
 * @param {unknown} raw
 * @returns {{ deviceId: string, name: string, savedAt: number }[]}
 */
export function parseRememberedHrDevices(raw) {
  let o = raw
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!o || typeof o !== 'object') return []
  if (Array.isArray(o.devices)) {
    const list = []
    const seen = new Set()
    for (const row of o.devices) {
      const d = parseRememberedHrDevice(row)
      if (!d || seen.has(d.deviceId)) continue
      seen.add(d.deviceId)
      list.push(d)
      if (list.length >= HR_MAX_SLOTS) break
    }
    return list
  }
  const one = parseRememberedHrDevice(o)
  return one ? [one] : []
}

/**
 * @param {string | null | undefined} trainerUserId
 * @returns {{ deviceId: string, name: string, savedAt: number }[]}
 */
export function readRememberedHrDevices(trainerUserId) {
  if (typeof localStorage === 'undefined') return []
  const uid = String(trainerUserId ?? '').trim()
  if (!uid) return []
  try {
    const raw = localStorage.getItem(rememberedHrDevicesStorageKey(uid))
    if (raw) return parseRememberedHrDevices(raw)
    const legacy = localStorage.getItem(rememberedHrDeviceStorageKey(uid))
    if (!legacy) return []
    const list = parseRememberedHrDevices(legacy)
    if (list.length) writeRememberedHrDevices(uid, list)
    return list
  } catch {
    return []
  }
}

/**
 * @param {string | null | undefined} trainerUserId
 * @returns {{ deviceId: string, name: string, savedAt: number } | null}
 */
export function readRememberedHrDevice(trainerUserId) {
  return readRememberedHrDevices(trainerUserId)[0] ?? null
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {{ deviceId: string, name?: string, savedAt?: number }[]} devices
 */
export function writeRememberedHrDevices(trainerUserId, devices) {
  if (typeof localStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  if (!uid) return
  const list = []
  const seen = new Set()
  for (const row of devices ?? []) {
    const d = parseRememberedHrDevice(row)
    if (!d || seen.has(d.deviceId)) continue
    seen.add(d.deviceId)
    list.push(d)
    if (list.length >= HR_MAX_SLOTS) break
  }
  try {
    localStorage.setItem(
      rememberedHrDevicesStorageKey(uid),
      JSON.stringify({ devices: list, savedAt: Date.now() }),
    )
  } catch {
    /* quota */
  }
}

/**
 * Добавить/обновить устройство в списке (макс. HR_MAX_SLOTS, новые в конец, вытеснение старых).
 * @param {string | null | undefined} trainerUserId
 * @param {{ deviceId?: string, name?: string } | null | undefined} device
 */
export function writeRememberedHrDevice(trainerUserId, device) {
  if (!device?.deviceId) return
  const uid = String(trainerUserId ?? '').trim()
  if (!uid) return
  const next = parseRememberedHrDevice({
    deviceId: device.deviceId,
    name: device.name,
    savedAt: Date.now(),
  })
  if (!next) return
  const prev = readRememberedHrDevices(uid).filter((d) => d.deviceId !== next.deviceId)
  writeRememberedHrDevices(uid, [...prev, next].slice(-HR_MAX_SLOTS))
}

/**
 * @param {string | null | undefined} trainerUserId
 * @param {string | null | undefined} deviceId
 */
export function removeRememberedHrDevice(trainerUserId, deviceId) {
  const uid = String(trainerUserId ?? '').trim()
  const id = String(deviceId ?? '').trim()
  if (!uid || !id) return
  writeRememberedHrDevices(
    uid,
    readRememberedHrDevices(uid).filter((d) => d.deviceId !== id),
  )
}

/**
 * @param {string | null | undefined} trainerUserId
 */
export function clearRememberedHrDevice(trainerUserId) {
  if (typeof localStorage === 'undefined') return
  const uid = String(trainerUserId ?? '').trim()
  if (!uid) return
  try {
    localStorage.removeItem(rememberedHrDevicesStorageKey(uid))
    localStorage.removeItem(rememberedHrDeviceStorageKey(uid))
  } catch {
    /* ignore */
  }
}
