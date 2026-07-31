/**
 * Локальный кэш прайса ТЗ.
 */

import { emptyTzPriceListDocument, normalizeTzPriceListDocument } from './tzPriceListCore.js'
import {
  isPriceListCloudFresh,
  parsePriceListLocalCache,
  wrapPriceListLocalCache,
} from './priceListCacheCore.js'

const PREFIX = 'os-tz-price-list:v1:'

/** @param {string} clubId */
export function tzPriceListStorageKey(clubId) {
  return `${PREFIX}${String(clubId ?? '').trim()}`
}

/**
 * @param {string} clubId
 */
export function readTzPriceListLocalEntry(clubId) {
  const id = String(clubId ?? '').trim()
  const empty = emptyTzPriceListDocument({ club_id: id })
  if (!id || typeof localStorage === 'undefined') {
    return { doc: empty, fetchedAt: 0, fresh: false }
  }
  try {
    const raw = localStorage.getItem(tzPriceListStorageKey(id))
    if (!raw) return { doc: empty, fetchedAt: 0, fresh: false }
    const { doc, fetchedAt } = parsePriceListLocalCache(JSON.parse(raw))
    if (!doc) return { doc: empty, fetchedAt: 0, fresh: false }
    return {
      doc: normalizeTzPriceListDocument(doc, id),
      fetchedAt,
      fresh: isPriceListCloudFresh(fetchedAt),
    }
  } catch {
    return { doc: empty, fetchedAt: 0, fresh: false }
  }
}

/**
 * @param {string} clubId
 * @param {object} doc
 * @param {{ fetchedAt?: number | null }} [opts]
 */
export function writeTzPriceListLocal(clubId, doc, opts = {}) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, error: 'Не выбран клуб' }
  if (typeof localStorage === 'undefined') return { ok: false, error: 'Нет localStorage' }
  try {
    const prev = readTzPriceListLocalEntry(id)
    const next = normalizeTzPriceListDocument(
      {
        ...doc,
        club_id: id,
        updated_at: doc?.updated_at || new Date().toISOString(),
      },
      id,
    )
    let fetchedAt = prev.fetchedAt
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'fetchedAt')) {
      const at = Number(opts.fetchedAt)
      fetchedAt = Number.isFinite(at) && at > 0 ? at : 0
    }
    localStorage.setItem(tzPriceListStorageKey(id), JSON.stringify(wrapPriceListLocalCache(next, fetchedAt)))
    return { ok: true, doc: next, fetchedAt }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'localStorage' }
  }
}
