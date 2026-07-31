/**
 * Облачный прайс ТЗ: /api/admin-data?action=tz-price-list
 */

import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'
import { emptyTzPriceListDocument, normalizeTzPriceListDocument } from './tzPriceListCore.js'
import { readTzPriceListLocalEntry, writeTzPriceListLocal } from './tzPriceListLocalStorage.js'

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
export async function fetchTzPriceListForClub(clubId, opts = {}) {
  const id = String(clubId ?? '').trim()
  if (!id) {
    return { ok: false, error: 'Не выбран клуб', doc: emptyTzPriceListDocument(), source: 'empty', exists: false }
  }

  const force = Boolean(opts.force)
  const localEntry = readTzPriceListLocalEntry(id)
  const local = localEntry.doc
  const hasLocal = Boolean(
    local.updated_at || local.month1_rows?.length || local.promo_rows?.length,
  )

  if (!force && localEntry.fresh && hasLocal) {
    return { ok: true, doc: local, source: 'local', exists: hasLocal, fromCache: true }
  }

  try {
    const token = await getAccessTokenForAdminApi()
    if (!token) {
      return { ok: true, doc: local, source: 'local', exists: hasLocal, fromCache: true }
    }
    const res = await fetchWithAppTimeout(
      `${apiOrigin()}/api/admin-data?action=tz-price-list&club_id=${encodeURIComponent(id)}`,
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
    const doc = normalizeTzPriceListDocument(data?.price_list, id)
    writeTzPriceListLocal(id, doc, { fetchedAt: Date.now() })
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
export async function saveTzPriceListForClub(clubId, doc) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, error: 'Не выбран клуб' }

  const normalized = normalizeTzPriceListDocument(doc, id)

  try {
    const token = await getAccessTokenForAdminApi()
    if (!token) return { ok: false, error: 'Нет сессии' }

    const res = await fetchWithAppTimeout(`${apiOrigin()}/api/admin-data?action=tz-price-list`, {
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
    const saved = normalizeTzPriceListDocument(data?.price_list ?? normalized, id)
    writeTzPriceListLocal(id, saved, { fetchedAt: Date.now() })
    return { ok: true, doc: saved }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Сеть' }
  }
}
