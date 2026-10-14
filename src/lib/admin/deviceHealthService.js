/**
 * Центр сбоев устройств (admin-data?action=device-health / device-health-resolve) — только админ.
 */
import { apiRouteMissing, getAccessTokenForAdminApi } from './adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

async function call(method, action, body) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — выйдите и войдите снова')
  const res = await fetchWithAppTimeout(`${window.location.origin}/api/admin-data?action=${action}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (apiRouteMissing(res, res.headers.get('content-type') || '')) throw new Error('Сервер без центра сбоев — нужен деплой')
  if (!res.ok) throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  return data
}

/** @returns {Promise<{ devices: object[], attention: number }>} */
export async function fetchDeviceHealth() {
  const data = await call('GET', 'device-health')
  return { devices: Array.isArray(data.devices) ? data.devices : [], attention: Number(data.attention) || 0 }
}

export async function resolveDeviceHealth(id) {
  await call('POST', 'device-health-resolve', { id })
}
