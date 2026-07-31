/**
 * Локальный кэш прайса АЗ.
 */

import { emptyAzPriceListDocument, normalizeAzPriceListDocument, azPriceListHasGrid } from './azPriceListCore.js'
import {
  isPriceListCloudFresh,
  parsePriceListLocalCache,
  wrapPriceListLocalCache,
} from './priceListCacheCore.js'

const PREFIX = 'os-az-price-list:v1:'

/** @param {string} clubId */
export function azPriceListStorageKey(clubId) {
  return `${PREFIX}${String(clubId ?? '').trim()}`
}

/**
 * @param {string} clubId
 */
export function readAzPriceListLocalEntry(clubId) {
  const id = String(clubId ?? '').trim()
  const empty = emptyAzPriceListDocument({ club_id: id })
  if (!id || typeof localStorage === 'undefined') {
    return { doc: empty, fetchedAt: 0, fresh: false }
  }
  try {
    const raw = localStorage.getItem(azPriceListStorageKey(id))
    if (!raw) return { doc: empty, fetchedAt: 0, fresh: false }
    const { doc, fetchedAt } = parsePriceListLocalCache(JSON.parse(raw))
    if (!doc) return { doc: empty, fetchedAt: 0, fresh: false }
    return {
      doc: normalizeAzPriceListDocument(doc, id),
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
export function writeAzPriceListLocal(clubId, doc, opts = {}) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, error: 'Не выбран клуб' }
  if (typeof localStorage === 'undefined') return { ok: false, error: 'Нет localStorage' }
  try {
    const prev = readAzPriceListLocalEntry(id)
    const next = normalizeAzPriceListDocument(
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
    localStorage.setItem(azPriceListStorageKey(id), JSON.stringify(wrapPriceListLocalCache(next, fetchedAt)))
    return { ok: true, doc: next, fetchedAt }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'localStorage' }
  }
}

/** @param {object} doc */
export function azPriceListLocalHasContent(doc) {
  return Boolean(doc?.updated_at || azPriceListHasGrid(doc) || (doc?.extras?.other_fees ?? []).length)
}
