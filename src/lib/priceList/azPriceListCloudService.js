/**
 * Облачный прайс АЗ: /api/admin-data?action=az-price-list
 */

import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'
import { emptyAzPriceListDocument, normalizeAzPriceListDocument } from './azPriceListCore.js'
import {
  azPriceListLocalHasContent,
  readAzPriceListLocalEntry,
  writeAzPriceListLocal,
} from './azPriceListLocalStorage.js'

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
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchAzPriceListForClub(clubId, opts = {}) {
  const id = String(clubId ?? '').trim()
  if (!id) {
    return { ok: false, error: 'Не выбран клуб', doc: emptyAzPriceListDocument(), source: 'empty', exists: false }
  }

  const force = Boolean(opts.force)
  const localEntry = readAzPriceListLocalEntry(id)
  const local = localEntry.doc
  const hasLocal = azPriceListLocalHasContent(local)

  if (!force && localEntry.fresh && hasLocal) {
    return { ok: true, doc: local, source: 'local', exists: hasLocal, fromCache: true }
  }

  try {
    const token = await getAccessTokenForAdminApi()
    if (!token) {
      return { ok: true, doc: local, source: 'local', exists: hasLocal, fromCache: true }
    }
    const res = await fetchWithAppTimeout(
      `${apiOrigin()}/api/admin-data?action=az-price-list&club_id=${encodeURIComponent(id)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
        cache: 'no-store',
      },
    )
    const data = await parseJsonResponse(res)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error ? String(data.error) : `Ошибка сервера (${res.status})`,
        doc: local,
        source: 'local',
        exists: hasLocal,
        fromCache: true,
      }
    }
    const doc = normalizeAzPriceListDocument(data?.price_list, id)
    writeAzPriceListLocal(id, doc, { fetchedAt: Date.now() })
    return {
      ok: true,
      doc,
      source: data?.exists ? 'cloud' : hasLocal ? 'cloud' : 'empty',
      exists: Boolean(data?.exists),
      fromCache: false,
    }
  } catch (e) {
    return {
      ok: true,
      doc: local,
      source: 'local',
      exists: hasLocal,
      fromCache: true,
      error: e?.message ? String(e.message) : 'Сеть',
    }
  }
}

/**
 * @param {string} clubId
 * @param {object} doc
 */
export async function saveAzPriceListForClub(clubId, doc) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, error: 'Не выбран клуб' }

  const normalized = normalizeAzPriceListDocument(doc, id)

  try {
    const token = await getAccessTokenForAdminApi()
    if (!token) return { ok: false, error: 'Нет сессии' }

    const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=az-price-list`, {
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
    const saved = normalizeAzPriceListDocument(data?.price_list ?? normalized, id)
    writeAzPriceListLocal(id, saved, { fetchedAt: Date.now() })
    return { ok: true, doc: saved }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Сеть' }
  }
}
