/**
 * Привязка устройств тренера (STRATEGY §5.7): 1 разрешённое устройство, остальные ждут «Разрешить» админа.
 * Чистые решения без базы — входят вход по паролю и продление сессии (authPortOwn → deviceBindingGate).
 *
 * Включается env DEVICE_BINDING_SINCE (ISO-дата выкладки). Сессии старше этой даты — «как были»:
 * устройство, с которого они продлеваются, становится разрешённым (решение владельца 10.10).
 * 7 дней после старта вход без номера устройства (старый бандл в кэше PWA) пропускаем.
 */
import { normalizeStaffRole } from '../../src/lib/admin/adminRoleCore.js'
import { DEVICE_PENDING_RU, DEVICE_UPDATE_APP_RU } from '../../src/lib/deviceIdentityCore.js'

export const DEVICE_LEGACY_DAYS = 7

const BOUND_ROLES = new Set(['trainer', 'тренер'])

/** Правило действует только для тренера; админ, менеджер, управляющий — без привязки. */
export function isDeviceBoundRole(role) {
  return BOUND_ROLES.has(normalizeStaffRole(role))
}

/** @returns {string | null} */
export function normalizeDeviceId(raw) {
  const v = String(raw ?? '').trim()
  return /^[A-Za-z0-9-]{16,64}$/.test(v) ? v : null
}

/**
 * Телефон тренера (/coach) получает номер с этим префиксом. Вид устройства читается из номера,
 * поэтому планшетные правила не зависят от новой колонки и не видят телефоны.
 */
export const COACH_DEVICE_PREFIX = 'coach-'

export function isCoachDeviceId(raw) {
  const v = normalizeDeviceId(raw)
  return Boolean(v) && v.startsWith(COACH_DEVICE_PREFIX)
}

/** @returns {'coach' | 'tablet'} */
export function deviceKindOf(deviceId) {
  return isCoachDeviceId(deviceId) ? 'coach' : 'tablet'
}

function sameKindDevices(devices, kind) {
  return devices.filter((d) => deviceKindOf(d.device_id) === kind)
}

/**
 * Телефон: каждое новое или отозванное устройство ждёт «Разрешить», даже первое и при выключенной
 * привязке планшетов; место планшета не занимает.
 * @param {{ deviceId: string | null, devices: Array<{ id: string, device_id: string, status: string }> }} p
 */
export function decideCoachDevice({ deviceId, devices }) {
  if (!isCoachDeviceId(deviceId)) return { allow: false, reason: 'no_device' }
  const own = devices.find((d) => d.device_id === deviceId)
  if (own?.status === 'approved') return { allow: true, reason: 'approved', deviceRowId: own.id }
  if (own) return { allow: false, reason: 'pending', deviceRowId: own.id, ...(own.status === 'revoked' ? { setStatus: 'pending' } : {}) }
  return { allow: false, reason: 'pending', register: 'pending' }
}

/**
 * @param {string | undefined} sinceRaw env DEVICE_BINDING_SINCE
 * @param {number} nowMs
 * @returns {{ active: boolean, sinceMs: number, legacyOpen: boolean }}
 */
export function deviceBindingWindow(sinceRaw, nowMs) {
  const sinceMs = Date.parse(String(sinceRaw ?? '').trim())
  if (!Number.isFinite(sinceMs) || sinceMs > nowMs) return { active: false, sinceMs: NaN, legacyOpen: false }
  return { active: true, sinceMs, legacyOpen: nowMs < sinceMs + DEVICE_LEGACY_DAYS * 86400000 }
}

function deviceOsLabel(s, touch) {
  if (/iPad/.test(s) || (touch && /Macintosh/.test(s))) return 'iPad'
  if (/iPhone/.test(s)) return 'iPhone'
  if (/Android/.test(s)) return /Mobile/.test(s) ? 'Android-телефон' : 'Android-планшет'
  if (/Windows/.test(s)) return 'Windows'
  if (/Macintosh/.test(s)) return 'Mac'
  if (/Linux/.test(s)) return touch ? 'Android-планшет' : 'Linux'
  return 'Устройство'
}

/**
 * «iPad · Safari» — подпись для админа, не для проверки.
 * touch: у устройства сенсор (заголовок x-device-touch) — Android-планшет в режиме «как на компьютере» шлёт UA Linux, iPad — Mac.
 */
export function deviceLabelFromUserAgent(ua, touch = false) {
  const s = String(ua ?? '')
  const os = deviceOsLabel(s, touch)
  const browser = /YaBrowser/.test(s)
    ? 'Яндекс Браузер'
    : /Edg\//.test(s)
      ? 'Edge'
      : /Firefox|FxiOS/.test(s)
        ? 'Firefox'
        : /Chrome|CriOS/.test(s)
          ? 'Chrome'
          : /Safari/.test(s)
            ? 'Safari'
            : ''
  return browser ? `${os} · ${browser}` : os
}

/**
 * Новое устройство: первое у тренера — разрешено сразу, остальные ждут админа.
 * @param {string} deviceId
 * @param {Array<{ id: string, device_id: string, status: string }>} devices
 */
function decideKnownOrNew(deviceId, devices) {
  const own = devices.find((d) => d.device_id === deviceId)
  if (own?.status === 'approved') return { allow: true, reason: 'approved', deviceRowId: own.id, bind: deviceId }
  if (own) {
    return {
      allow: false,
      reason: 'pending',
      deviceRowId: own.id,
      ...(own.status === 'revoked' ? { setStatus: 'pending' } : {}),
    }
  }
  if (!devices.some((d) => d.status === 'approved')) {
    return { allow: true, reason: 'first_device', register: 'approved', bind: deviceId }
  }
  return { allow: false, reason: 'pending', register: 'pending' }
}

/**
 * Вход по паролю.
 * @param {{ role: string, deviceId: string | null, devices: Array<{ id: string, device_id: string, status: string }>, window: { active: boolean, legacyOpen: boolean } }} p
 */
export function decideSignInDevice({ role, deviceId: rawId, devices: all, window }) {
  if (!window.active || !isDeviceBoundRole(role)) return { allow: true, reason: 'not_bound' }
  const deviceId = isCoachDeviceId(rawId) ? null : rawId
  const devices = sameKindDevices(all, 'tablet')
  if (!deviceId) return window.legacyOpen ? { allow: true, reason: 'legacy_no_device' } : { allow: false, reason: 'no_device' }
  return decideKnownOrNew(deviceId, devices)
}

/**
 * Продление сессии. Сессия уже знает устройство → только его статус.
 * Сессия без устройства, выданная до старта (или без sid — до 06.10) → устройство становится своим.
 * Без устройства, но после старта (старый бандл в окне 7 дней) → как вход по паролю.
 * @param {{ role: string, session: { device_id?: string | null, created_at?: string | null } | null, headerDeviceId: string | null, devices: Array<{ id: string, device_id: string, status: string }>, window: { active: boolean, sinceMs: number, legacyOpen: boolean } }} p
 */
export function decideRefreshDevice({ role, session, headerDeviceId: rawHeader, devices: all, window }) {
  if (!window.active || !isDeviceBoundRole(role)) return { allow: true, reason: 'not_bound' }
  const headerDeviceId = isCoachDeviceId(rawHeader) ? null : rawHeader
  const devices = sameKindDevices(all, 'tablet')
  const bound = session?.device_id ? String(session.device_id) : null
  if (bound) {
    const own = devices.find((d) => d.device_id === bound)
    return own?.status === 'approved' ? { allow: true, reason: 'approved', deviceRowId: own.id } : { allow: false, reason: 'revoked' }
  }
  if (!headerDeviceId) return window.legacyOpen ? { allow: true, reason: 'legacy_no_device' } : { allow: false, reason: 'no_device' }

  const createdMs = Date.parse(String(session?.created_at ?? ''))
  const grandfathered = !session || !Number.isFinite(createdMs) || createdMs < window.sinceMs
  if (!grandfathered) return decideKnownOrNew(headerDeviceId, devices)

  const own = devices.find((d) => d.device_id === headerDeviceId)
  if (own?.status === 'revoked') return { allow: false, reason: 'revoked' }
  if (own?.status === 'approved') return { allow: true, reason: 'approved', deviceRowId: own.id, bind: headerDeviceId }
  if (own) return { allow: true, reason: 'grandfathered', deviceRowId: own.id, setStatus: 'approved', bind: headerDeviceId }
  return { allow: true, reason: 'grandfathered', register: 'approved', bind: headerDeviceId }
}

/** Текст для экрана входа по причине отказа. */
export function deviceDenialMessageRu(reason) {
  return reason === 'no_device' ? DEVICE_UPDATE_APP_RU : DEVICE_PENDING_RU
}

/**
 * «Разрешить» / «Заменить» / «Отозвать» админом.
 * @param {'approve' | 'replace' | 'revoke'} action
 * @param {{ id: string, user_id: string, status: string }} target
 * @param {Array<{ id: string, device_id: string, status: string }>} userDevices все устройства того же тренера
 * @returns {{ updates: Array<{ id: string, status: 'approved' | 'revoked' }>, revokeDeviceIds: string[] } | { error: string }}
 */
export function planAdminDeviceAction(action, target, userDevices) {
  if (!target?.id) return { error: 'Устройство не найдено' }
  if (action === 'revoke') {
    if (target.status === 'revoked') return { updates: [], revokeDeviceIds: [] }
    const row = userDevices.find((d) => d.id === target.id)
    return { updates: [{ id: target.id, status: 'revoked' }], revokeDeviceIds: row ? [row.device_id] : [] }
  }
  if (action === 'approve' || action === 'replace') {
    const kind = deviceKindOf(userDevices.find((d) => d.id === target.id)?.device_id ?? target.device_id)
    // Телефон у тренера один: «Разрешить» новый отключает прежний.
    const replaces = action === 'replace' || kind === 'coach'
    const others = replaces
      ? sameKindDevices(userDevices, kind).filter((d) => d.id !== target.id && d.status === 'approved')
      : []
    return {
      updates: [{ id: target.id, status: 'approved' }, ...others.map((d) => ({ id: d.id, status: /** @type {const} */ ('revoked') }))],
      revokeDeviceIds: others.map((d) => d.device_id),
    }
  }
  return { error: 'Неизвестное действие' }
}
