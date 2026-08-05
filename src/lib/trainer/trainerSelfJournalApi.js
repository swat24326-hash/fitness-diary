/**
 * GET /api/admin-data?action=trainer-self-journal — список завершённых за период с сервера.
 */

import { getAccessTokenForAdminApi, apiRouteMissing } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout, CLUB_STATS_FETCH_TIMEOUT_MS } from '../networkReachability.js'
import { sleep } from '../supabaseRetry.js'

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

/**
 * @param {{ dateFrom: string, dateTo: string, clubId?: string | null }} p
 * @returns {Promise<{ trainings: object[], clientsById: Record<string, object>, totalCount: number, truncated?: boolean }>}
 */
export async function fetchTrainerSelfJournalViaApi(p) {
  const dateFrom = String(p.dateFrom ?? '').slice(0, 10)
  const dateTo = String(p.dateTo ?? '').slice(0, 10)
  if (!dateFrom || !dateTo) {
    throw new Error('Не задан период для журнала')
  }

  let token = await getAccessTokenForAdminApi()
  if (!token) {
    await sleep(400)
    token = await getAccessTokenForAdminApi()
  }
  if (!token) {
    throw new Error('Нет сессии — выйдите и войдите снова на планшете')
  }

  const params = new URLSearchParams({
    action: 'trainer-self-journal',
    date_from: dateFrom,
    date_to: dateTo,
  })
  const clubId = String(p.clubId ?? '').trim()
  if (clubId) params.set('club_id', clubId)

  const res = await fetchWithAppTimeout(
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

  if (apiRouteMissing(res, contentType)) {
    throw new Error('Сервер без action trainer-self-journal — нужен деплой')
  }
  if (!res.ok) {
    throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  }
  if (!Array.isArray(data?.trainings)) {
    throw new Error('Пустой ответ журнала с сервера')
  }
  return {
    trainings: data.trainings,
    clientsById: data.clientsById && typeof data.clientsById === 'object' ? data.clientsById : {},
    totalCount: typeof data.totalCount === 'number' ? data.totalCount : data.trainings.length,
    truncated: Boolean(data.truncated),
  }
}
