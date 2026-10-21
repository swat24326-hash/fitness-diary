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
 * Создать абонемент из клипа. confirm_transfer — смена тренера карточки, если он другой.
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
    body: JSON.stringify({
      ...body,
      op: 'create',
      confirm_transfer: body?.confirm_transfer === true || body?.confirmTransfer === true,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || data?.reason || 'Не удалось создать абонемент')
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
 * Закрыть старую заявку «без абонемента»: пакет пишется на этот же клип.
 * @param {{
 *   clubId: string,
 *   id: string,
 *   membershipTypeId?: string,
 *   totalTrainings?: number|string,
 *   startDate?: string,
 *   endDate?: string,
 * }} opts
 */
export async function fulfillSaleClip(opts) {
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
      op: 'fulfill',
      club_id: opts.clubId,
      id: opts.id,
      membership_type_id: opts.membershipTypeId || null,
      total_trainings: opts.totalTrainings ?? null,
      start_date: opts.startDate || null,
      end_date: opts.endDate || null,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    const err = new Error(data?.error || data?.reason || 'Не удалось создать абонемент')
    err.needsFields = data?.needsFields === true
    throw err
  }
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

/**
 * Даты и число занятий у пакета этой продажи.
 * @param {{ clubId: string, id: string, startDate?: string, endDate?: string, totalTrainings?: number|string }} opts
 */
export async function updateSaleClipMembership(opts) {
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
      op: 'update-membership',
      club_id: opts.clubId,
      id: opts.id,
      start_date: opts.startDate,
      end_date: opts.endDate,
      total_trainings: opts.totalTrainings,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error || data?.reason || 'Не удалось сохранить пакет')
  return data
}
