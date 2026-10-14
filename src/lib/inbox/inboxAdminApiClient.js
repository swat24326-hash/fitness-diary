/** Рассылки во «Входящие» клиентов и команды: GET/POST /api/admin-data?action=inbox. Только онлайн, не sync_queue. */
import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'
import { readApiBody, videoContentType } from '../chat/chatVideoTransport.js'

const TIMEOUT_MS = 30_000

/**
 * Общий вызов admin-data для «Входящих» (рассылки и ящик сотрудника) и переписки.
 * opts.raw — видеокружок: тело — сам файл, метаданные — в params.
 */
export async function inboxApiCall(action, method, params, body, { raw = null, timeoutMs = TIMEOUT_MS } = {}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const qs = new URLSearchParams({ action, ...params })
  const type = raw ? videoContentType(raw) : body ? 'application/json' : null
  let res
  try {
    res = await fetchWithAppTimeout(
      `${window.location.origin}/api/admin-data?${qs}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(type ? { 'Content-Type': type } : {}) },
        credentials: 'same-origin',
        cache: 'no-store',
        body: raw ?? (body ? JSON.stringify(body) : undefined),
      },
      timeoutMs,
    )
  } catch {
    throw new Error('Нет связи с сервером — проверьте интернет')
  }
  const data = await readApiBody(res)
  if (!res.ok) throw Object.assign(new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`), { status: res.status })
  return data
}

export function fetchInboxCampaigns() {
  return inboxApiCall('inbox', 'GET', { view: 'list' })
}

export function fetchInboxCampaign(id) {
  return inboxApiCall('inbox', 'GET', { view: 'detail', id: String(id ?? '') })
}

/** @param {{ audience: 'clients'|'staff', clubIds: string[], halls: string[], staffRoles: string[] }} f */
export function fetchInboxAudience(f) {
  return inboxApiCall('inbox', 'GET', {
    view: 'audience',
    audience: f.audience,
    club_ids: (f.clubIds ?? []).join(','),
    halls: (f.halls ?? []).join(','),
    roles: (f.staffRoles ?? []).join(','),
  })
}

export function sendInboxCampaign(draft) {
  return inboxApiCall('inbox', 'POST', {}, { op: 'send', draft })
}

export function closeInboxCampaign(id) {
  return inboxApiCall('inbox', 'POST', {}, { op: 'close', id })
}
