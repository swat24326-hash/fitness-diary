/**
 * Клиентский сервис клип-карт (admin / sales_manager).
 */
import { getAccessTokenForAdminApi } from './adminApiClient.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 300) }
  }
}

/**
 * @param {{ clubId: string, clipDate?: string, status?: string }} opts
 */
export async function fetchSaleClips(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const qs = new URLSearchParams({ action: 'sale-clips', club_id: String(opts.clubId ?? '') })
  if (opts.clipDate) qs.set('clip_date', String(opts.clipDate).slice(0, 10))
  if (opts.status) qs.set('status', String(opts.status))
  const res = await fetch(`${apiOrigin()}/api/admin-data?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить клипы')
  return data
}

/**
 * @param {object} body
 */
export async function createSaleClip(body) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const res = await fetch(`${apiOrigin()}/api/admin-data?action=sale-clips`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ op: 'create', ...body }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || data?.reason || 'Не удалось создать клип')
  return data
}

/**
 * @param {{ clubId: string, cardNumber?: string, phone?: string, clipDate?: string }} opts
 */
export async function matchSaleClipClient(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const res = await fetch(`${apiOrigin()}/api/admin-data?action=sale-clips`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'match',
      club_id: opts.clubId,
      card_number: opts.cardNumber || '',
      phone: opts.phone || '',
      clip_date: opts.clipDate || '',
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || data?.reason || 'Не удалось найти клиента')
  return data
}

/**
 * @param {{ clubId: string, id: string }} opts
 */
export async function cancelSaleClip(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  const res = await fetch(`${apiOrigin()}/api/admin-data?action=sale-clips`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ op: 'cancel', club_id: opts.clubId, id: opts.id }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || data?.reason || 'Не удалось отменить клип')
  return data
}
