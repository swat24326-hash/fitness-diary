import { getAccessTokenForAdminApi, apiRouteMissing } from './adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

/**
 * GET admin-data?action=club-sms — настроены ли Мои Звонки + шаблоны SMS клуба.
 * @param {string} clubId
 * @returns {Promise<{ configured: boolean, templates?: Record<string, string>, clubName?: string }>}
 */
export async function fetchClubSmsStatus(clubId) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const qs = new URLSearchParams({ club_id: String(clubId ?? '').trim() })
  const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=club-sms&${qs}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const ct = res.headers.get('content-type') || ''
  if (apiRouteMissing(res, ct)) {
    throw new Error('API club-sms недоступен — нужен деплой с Мои Звонки')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Не удалось проверить настройки SMS')
  }
  return {
    configured: data?.configured === true,
    templates: data?.templates && typeof data.templates === 'object' ? data.templates : undefined,
    clubName: data?.club_name ? String(data.club_name) : '',
  }
}

/**
 * POST admin-data?action=club-sms
 * @param {{
 *   clubId: string,
 *   clientId: string,
 *   scenario?: string,
 *   text?: string,
 * }} opts
 */
export async function sendClubSmsViaApi(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')

  const body = {
    club_id: String(opts.clubId ?? '').trim(),
    client_id: String(opts.clientId ?? '').trim(),
  }
  if (opts.scenario) body.scenario = String(opts.scenario)
  if (opts.text) body.text = String(opts.text)

  const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=club-sms`, {
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
    throw new Error('API club-sms недоступен — нужен деплой с Мои Звонки')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.ok === false) {
    const detail = data?.detail ? ` (${data.detail})` : ''
    const err = new Error((data?.error || 'Не удалось отправить SMS') + detail)
    err.code = data?.code
    throw err
  }
  return data
}
