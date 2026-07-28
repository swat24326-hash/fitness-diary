/**
 * GET /api/admin-data?action=trainer-self-stats — ЗП и сводка периода с сервера.
 */

import { getAccessTokenForAdminApi, apiRouteMissing } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout, CLUB_STATS_FETCH_TIMEOUT_MS } from '../networkReachability.js'

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

/**
 * @param {{ dateFrom: string, dateTo: string, dayIso: string }} p
 * @returns {Promise<object | null>} null если маршрута нет / нет сессии
 */
export async function fetchTrainerSelfStatsViaApi(p) {
  const dateFrom = String(p.dateFrom ?? '').slice(0, 10)
  const dateTo = String(p.dateTo ?? '').slice(0, 10)
  const dayIso = String(p.dayIso ?? dateTo).slice(0, 10)
  if (!dateFrom || !dateTo || !dayIso) return null

  const token = await getAccessTokenForAdminApi()
  if (!token) return null

  const params = new URLSearchParams({
    action: 'trainer-self-stats',
    date_from: dateFrom,
    date_to: dateTo,
    day: dayIso,
  })

  let res
  res = await fetchWithAppTimeout(
    `${apiOrigin()}/api/admin-data?${params}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    },
    CLUB_STATS_FETCH_TIMEOUT_MS,
  )

  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }

  if (apiRouteMissing(res, contentType)) return null
  if (!res.ok) {
    throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  }
  return data
}
