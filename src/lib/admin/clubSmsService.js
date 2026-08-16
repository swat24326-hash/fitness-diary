import { getAccessTokenForAdminApi, apiRouteMissing } from './adminApiClient.js'
import { fetchWithAppTimeout, MOIZVONKI_FETCH_TIMEOUT_MS } from '../networkReachability.js'
import { CLUB_SMS_LOG_DEFAULT_LOOKBACK_DAYS, CLUB_SMS_LOG_MAX_LOOKBACK_DAYS } from './clubSmsLogCore.js'
import {
  clubOpsDayBoundsUtc,
  inclusiveCalendarDaysBetween,
  normalizeClubOpsDayIso,
  todayInTimeZoneIso,
} from '../dateRu.js'

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
 * Облачный журнал SMS клуба.
 * @param {string} clubId
 * @param {{ sinceDays?: number, day?: string, clientId?: string }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchClubSmsLogs(clubId, opts = {}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const today = todayInTimeZoneIso()
  const day = normalizeClubOpsDayIso(opts.day, today)
  const sinceDays = day
    ? Math.min(
        CLUB_SMS_LOG_MAX_LOOKBACK_DAYS,
        Math.max(1, inclusiveCalendarDaysBetween(day, today)),
      )
    : Number(opts.sinceDays) > 0
      ? Number(opts.sinceDays)
      : CLUB_SMS_LOG_DEFAULT_LOOKBACK_DAYS
  const qs = new URLSearchParams({
    club_id: String(clubId ?? '').trim(),
    logs: '1',
    since_days: String(sinceDays),
  })
  if (day) qs.set('day', day)
  const clientId = String(opts.clientId ?? '').trim()
  if (clientId) qs.set('client_id', clientId)
  const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=club-sms&${qs}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const ct = res.headers.get('content-type') || ''
  if (apiRouteMissing(res, ct)) {
    throw new Error('API club-sms недоступен — нужен деплой с журналом SMS')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Не удалось загрузить журнал SMS')
  }
  if (data?.logs_error) {
    const raw = String(data.logs_error)
    if (/club_sms_log|does not exist|schema cache|relation/i.test(raw)) {
      throw new Error('Журнал SMS не создан в базе — выполните миграцию club_sms_log на Supabase')
    }
    throw new Error(raw.slice(0, 160) || 'Не удалось загрузить журнал SMS')
  }
  let logs = Array.isArray(data?.logs) ? data.logs : []
  if (day) {
    const { gte, lt } = clubOpsDayBoundsUtc(day)
    logs = logs.filter((row) => {
      const t = String(row?.created_at ?? '')
      return t && t >= gte && t < lt
    })
  }
  if (clientId) {
    logs = logs.filter((row) => String(row?.client_id ?? '').trim() === clientId)
  }
  return logs
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

  const res = await fetchWithAppTimeout(
    `${apiOrigin()}/api/admin-data?action=club-sms`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(body),
    },
    MOIZVONKI_FETCH_TIMEOUT_MS,
  )
  const ct = res.headers.get('content-type') || ''
  if (apiRouteMissing(res, ct)) {
    throw new Error('API club-sms недоступен — нужен деплой с Мои Звонки')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.ok === false) {
    const detail = data?.detail ? ` (${data.detail})` : ''
    const err = new Error((data?.error || 'Не удалось отправить SMS') + detail)
    err.code = data?.code
    if (data?.retry_after_sec != null) err.retry_after_sec = Number(data.retry_after_sec) || 0
    throw err
  }
  return data
}
