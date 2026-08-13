import { getAccessTokenForAdminApi, apiRouteMissing } from './adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'
import { CLUB_CALL_LOG_DEFAULT_LOOKBACK_DAYS } from './clubCallLogCore.js'

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

/**
 * GET admin-data?action=club-call — настроены ли Мои Звонки для звонка.
 * @param {string} clubId
 */
export async function fetchClubCallStatus(clubId) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const qs = new URLSearchParams({ club_id: String(clubId ?? '').trim() })
  const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=club-call&${qs}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const ct = res.headers.get('content-type') || ''
  if (apiRouteMissing(res, ct)) {
    throw new Error('API club-call недоступен — нужен деплой с звонками Мои Звонки')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Не удалось проверить настройки звонков')
  }
  return {
    configured: data?.configured === true,
    clubName: data?.club_name ? String(data.club_name) : '',
  }
}

/**
 * Облачный журнал звонков клуба (опционально — одного клиента).
 * @param {string} clubId
 * @param {{ sinceDays?: number, clientId?: string }} [opts]
 */
export async function fetchClubCallLogs(clubId, opts = {}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const sinceDays =
    Number(opts.sinceDays) > 0 ? Number(opts.sinceDays) : CLUB_CALL_LOG_DEFAULT_LOOKBACK_DAYS
  const qs = new URLSearchParams({
    club_id: String(clubId ?? '').trim(),
    logs: '1',
    since_days: String(sinceDays),
  })
  const clientId = String(opts.clientId ?? '').trim()
  if (clientId) qs.set('client_id', clientId)
  const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=club-call&${qs}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const ct = res.headers.get('content-type') || ''
  if (apiRouteMissing(res, ct)) {
    throw new Error('API club-call недоступен — нужен деплой с журналом звонков')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Не удалось загрузить журнал звонков')
  }
  if (data?.logs_error) {
    const raw = String(data.logs_error)
    if (/club_call_log|does not exist|schema cache|relation/i.test(raw)) {
      throw new Error('Журнал звонков не создан в базе — выполните миграцию club_call_log на Supabase')
    }
    throw new Error(raw.slice(0, 160) || 'Не удалось загрузить журнал звонков')
  }
  return Array.isArray(data?.logs) ? data.logs : []
}

/**
 * POST admin-data?action=club-call — запуск звонка с телефона клуба.
 * @param {{ clubId: string, clientId: string }} opts
 */
export async function makeClubCallViaApi(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')

  const body = {
    club_id: String(opts.clubId ?? '').trim(),
    client_id: String(opts.clientId ?? '').trim(),
  }

  const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=club-call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  const ct = res.headers.get('content-type') || ''
  if (apiRouteMissing(res, ct)) {
    throw new Error('API club-call недоступен — нужен деплой с звонками Мои Звонки')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.ok === false) {
    const detail = data?.detail ? ` (${data.detail})` : ''
    const err = new Error((data?.error || 'Не удалось запустить звонок') + detail)
    err.code = data?.code
    if (data?.retry_after_sec != null) err.retry_after_sec = Number(data.retry_after_sec) || 0
    throw err
  }
  return data
}
