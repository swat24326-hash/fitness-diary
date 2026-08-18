/**
 * GET loyalty-account / loyalty-glance через admin-data. Не класть в trainer-pull.
 * Таймаут короткий: complete/Sync не должны ждать 45 с как club-stats.
 */

import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'
import {
  LOYALTY_COMPLETE_SETTINGS_TIMEOUT_MS,
  LOYALTY_FETCH_TIMEOUT_MS,
} from './loyaltyTimeoutCore.js'

export { LOYALTY_COMPLETE_SETTINGS_TIMEOUT_MS, LOYALTY_FETCH_TIMEOUT_MS }

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function getJson(path, timeoutMs = LOYALTY_FETCH_TIMEOUT_MS) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const res = await fetchWithAppTimeout(
    `${apiOrigin()}${path}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    },
    timeoutMs,
  )
  const data = await parseJson(res)
  if (res.ok) return data
  const err = new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  err.status = res.status
  err.body = data
  throw err
}

async function postJson(path, body) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const res = await fetchWithAppTimeout(
    `${apiOrigin()}${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(body ?? {}),
    },
    LOYALTY_FETCH_TIMEOUT_MS,
  )
  const data = await parseJson(res)
  if (res.ok) return data
  const err = new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  err.status = res.status
  err.body = data
  throw err
}

/** GET /api/admin-data?action=loyalty-account */
export async function fetchLoyaltyAccount(clientId, timeoutMs = LOYALTY_FETCH_TIMEOUT_MS) {
  const id = String(clientId ?? '').trim()
  if (!id) throw new Error('Укажите client_id')
  const params = new URLSearchParams({ action: 'loyalty-account', client_id: id })
  return getJson(`/api/admin-data?${params}`, timeoutMs)
}

/**
 * GET /api/admin-data?action=loyalty-glance
 * @param {string} clubId
 * @param {string[]} clientIds пачка уже ≤80
 */
export async function fetchLoyaltyGlance(clubId, clientIds) {
  const club = String(clubId ?? '').trim()
  const ids = (clientIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean)
  if (!club) throw new Error('Укажите club_id')
  if (!ids.length) return { ok: true, club_id: club, by_id: {} }
  const params = new URLSearchParams({
    action: 'loyalty-glance',
    club_id: club,
    ids: ids.join(','),
  })
  return getJson(`/api/admin-data?${params}`)
}

/** POST /api/admin-data?action=loyalty-redeem — не sync_queue. */
export async function postLoyaltyRedeem({ clientId, expectedPoints, comment }) {
  const client_id = String(clientId ?? '').trim()
  if (!client_id) throw new Error('Укажите client_id')
  return postJson('/api/admin-data?action=loyalty-redeem', {
    client_id,
    expected_points: expectedPoints,
    comment,
  })
}

/** GET /api/admin-data?action=loyalty-journal */
export async function fetchLoyaltyJournal(clubId) {
  const club = String(clubId ?? '').trim()
  if (!club) throw new Error('Укажите club_id')
  const params = new URLSearchParams({ action: 'loyalty-journal', club_id: club })
  return getJson(`/api/admin-data?${params}`)
}

/** GET /api/admin-data?action=loyalty-settings */
export async function fetchLoyaltySettings(clubId, timeoutMs = LOYALTY_FETCH_TIMEOUT_MS) {
  const club = String(clubId ?? '').trim()
  if (!club) throw new Error('Укажите club_id')
  const params = new URLSearchParams({ action: 'loyalty-settings', club_id: club })
  return getJson(`/api/admin-data?${params}`, timeoutMs)
}

/** POST /api/admin-data?action=loyalty-settings — не sync_queue. */
export async function postLoyaltySettings(body) {
  return postJson('/api/admin-data?action=loyalty-settings', body ?? {})
}
