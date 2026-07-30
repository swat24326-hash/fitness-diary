/**
 * Облачный прайс клуба через /api/admin-data?action=price-list
 */

import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'
import { emptyPriceListDocument, normalizePriceListDocument } from './priceListCore.js'
import { readPriceListLocal, writePriceListLocal } from './priceListLocalStorage.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 200) }
  }
}

/**
 * @param {string} clubId
 * @returns {Promise<{ ok: true, doc: object, source: 'cloud' | 'local' | 'empty', exists: boolean } | { ok: false, error: string, doc: object }>}
 */
export async function fetchPriceListForClub(clubId) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, error: 'Не выбран клуб', doc: emptyPriceListDocument() }

  const local = readPriceListLocal(id)

  try {
    const token = await getAccessTokenForAdminApi()
    if (!token) {
      return { ok: true, doc: local, source: 'local', exists: Boolean(local.updated_at) }
    }
    const res = await fetchWithAppTimeout(
      `${apiOrigin()}/api/admin-data?action=price-list&club_id=${encodeURIComponent(id)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
        cache: 'no-store',
      },
    )
    const data = await parseJsonResponse(res)
    if (!res.ok) {
      if (res.status === 404 || res.status === 405) {
        return { ok: true, doc: local, source: 'local', exists: Boolean(local.updated_at) }
      }
      return {
        ok: false,
        error: data?.error ? String(data.error) : `Ошибка сервера (${res.status})`,
        doc: local,
      }
    }
    const doc = normalizePriceListDocument(data?.price_list, id)
    writePriceListLocal(id, doc)
    return {
      ok: true,
      doc,
      source: data?.exists ? 'cloud' : doc.tariffs?.length || doc.updated_at ? 'cloud' : 'empty',
      exists: Boolean(data?.exists),
    }
  } catch (e) {
    return {
      ok: true,
      doc: local,
      source: 'local',
      exists: Boolean(local.updated_at),
      error: e?.message ? String(e.message) : 'Сеть',
    }
  }
}

/**
 * @param {string} clubId
 * @param {object} doc
 * @returns {Promise<{ ok: true, doc: object } | { ok: false, error: string }>}
 */
export async function savePriceListForClub(clubId, doc) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, error: 'Не выбран клуб' }

  const normalized = normalizePriceListDocument(doc, id)

  try {
    const token = await getAccessTokenForAdminApi()
    if (!token) return { ok: false, error: 'Нет сессии' }

    const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=price-list`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ club_id: id, price_list: normalized }),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ? String(data.error) : `Ошибка сервера (${res.status})`,
      }
    }
    const saved = normalizePriceListDocument(data?.price_list ?? normalized, id)
    writePriceListLocal(id, saved)
    return { ok: true, doc: saved }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Сеть' }
  }
}
