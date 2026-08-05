/**
 * GET /api/admin-data?action=deletion-audit-log
 */

import { getAccessTokenForAdminApi, apiRouteMissing } from './adminApiClient.js'
import { fetchWithAppTimeout, CLUB_STATS_FETCH_TIMEOUT_MS } from '../networkReachability.js'

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

/**
 * @param {{ clubId?: string, page?: number, pageSize?: number, q?: string }} p
 */
export async function fetchDeletionAuditLogViaApi(p = {}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const params = new URLSearchParams({ action: 'deletion-audit-log' })
  const clubId = String(p.clubId ?? '').trim()
  if (clubId) params.set('club_id', clubId)
  if (p.page != null) params.set('page', String(p.page))
  if (p.pageSize != null) params.set('page_size', String(p.pageSize))
  const q = String(p.q ?? '').trim()
  if (q) params.set('q', q)

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
    throw new Error('Сервер без action deletion-audit-log — нужен деплой')
  }
  if (!res.ok) {
    throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  }
  return {
    rows: Array.isArray(data.rows) ? data.rows : [],
    totalCount: typeof data.totalCount === 'number' ? data.totalCount : 0,
    page: data.page ?? 0,
    pageSize: data.pageSize ?? 50,
  }
}
