import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'
import { humanizeNetworkError } from '../supabaseRetry.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 200) }
  }
}

/**
 * @param {{ clubId: string, dateFrom?: string, dateTo?: string }} opts
 */
export async function fetchPnkBundle(opts) {
  const clubId = String(opts.clubId ?? '').trim()
  if (!clubId) throw new Error('Укажите клуб')
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const q = new URLSearchParams({ action: 'pnk', club_id: clubId })
  if (opts.dateFrom) q.set('date_from', String(opts.dateFrom).slice(0, 10))
  if (opts.dateTo) q.set('date_to', String(opts.dateTo).slice(0, 10))

  try {
    const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`)
    return data
  } catch (e) {
    throw new Error(humanizeNetworkError(e))
  }
}

/**
 * @param {{ clubId: string, name: string, phone?: string, trainer_id: string, pnk_source?: string }} payload
 */
export async function createPnkClient(payload) {
  const clubId = String(payload.clubId ?? '').trim()
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  try {
    const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=pnk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        op: 'create',
        club_id: clubId,
        name: payload.name,
        phone: payload.phone,
        trainer_id: payload.trainer_id,
        pnk_source: payload.pnk_source || 'manager',
      }),
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`)
    return data.client
  } catch (e) {
    throw new Error(humanizeNetworkError(e))
  }
}

/**
 * @param {{ clubId: string, client_id: string } & Record<string, unknown>} payload
 */
export async function patchPnkClient(payload) {
  const clubId = String(payload.clubId ?? '').trim()
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  try {
    const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=pnk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        op: 'patch',
        club_id: clubId,
        client_id: payload.client_id,
        stage: payload.stage,
        trial_date: payload.trial_date,
        trial_time: payload.trial_time,
        trainer_id: payload.trainer_id,
        deliverable: payload.deliverable,
        comment: payload.comment,
        lost_reason: payload.lost_reason,
      }),
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`)
    return data.client
  } catch (e) {
    throw new Error(humanizeNetworkError(e))
  }
}

/**
 * @param {{ clubId: string, client_id: string }} payload
 */
export async function deletePnkClient(payload) {
  const clubId = String(payload.clubId ?? '').trim()
  const clientId = String(payload.client_id ?? '').trim()
  if (!clubId || !clientId) throw new Error('Укажите клуб и клиента')
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  try {
    const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=pnk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        op: 'delete',
        club_id: clubId,
        client_id: clientId,
      }),
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`)
    return data
  } catch (e) {
    throw new Error(humanizeNetworkError(e))
  }
}
