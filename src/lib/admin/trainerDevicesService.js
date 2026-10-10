/**
 * Устройства тренеров (admin-data?action=trainer-devices / trainer-device-set) — только админ.
 */
import { getAccessTokenForAdminApi, apiRouteMissing } from './adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

async function call(method, action, body) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=${action}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const contentType = res.headers.get('content-type') || ''
  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (apiRouteMissing(res, contentType)) throw new Error('Сервер без раздела устройств — нужен деплой')
  if (!res.ok) throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  return data
}

/** @returns {Promise<{ devices: object[], bindingActive: boolean }>} */
export async function fetchTrainerDevices() {
  const data = await call('GET', 'trainer-devices')
  return { devices: Array.isArray(data.devices) ? data.devices : [], bindingActive: data.binding_active === true }
}

/** @param {'approve' | 'replace' | 'revoke'} op */
export async function setTrainerDevice(id, op) {
  await call('POST', 'trainer-device-set', { id, op })
}
