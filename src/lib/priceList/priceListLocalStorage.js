/**
 * Локальный кэш прайса по клубу (не sync / IndexedDB планшета).
 * Облако — источник истины; здесь — мгновенный показ + TTL.
 */

import { emptyPriceListDocument, normalizePriceListDocument } from './priceListCore.js'
import {
  isPriceListCloudFresh,
  parsePriceListLocalCache,
  PRICE_LIST_CLOUD_TTL_MS,
  wrapPriceListLocalCache,
} from './priceListCacheCore.js'

const PREFIX = 'os-price-list:v1:'

/** @param {string} clubId */
export function priceListStorageKey(clubId) {
  return `${PREFIX}${String(clubId ?? '').trim()}`
}

/**
 * @param {string} clubId
 * @returns {{ doc: object, fetchedAt: number, fresh: boolean }}
 */
export function readPriceListLocalEntry(clubId) {
  const id = String(clubId ?? '').trim()
  const empty = emptyPriceListDocument({ club_id: id })
  if (!id || typeof localStorage === 'undefined') {
    return { doc: empty, fetchedAt: 0, fresh: false }
  }
  try {
    const raw = localStorage.getItem(priceListStorageKey(id))
    if (!raw) return { doc: empty, fetchedAt: 0, fresh: false }
    const { doc, fetchedAt } = parsePriceListLocalCache(JSON.parse(raw))
    if (!doc) return { doc: empty, fetchedAt: 0, fresh: false }
    const normalized = normalizePriceListDocument(doc, id)
    return {
      doc: normalized,
      fetchedAt,
      fresh: isPriceListCloudFresh(fetchedAt),
    }
  } catch {
    return { doc: empty, fetchedAt: 0, fresh: false }
  }
}

/**
 * @param {string} clubId
 * @returns {object}
 */
export function readPriceListLocal(clubId) {
  return readPriceListLocalEntry(clubId).doc
}

/**
 * @param {string} clubId
 * @param {object} doc
 * @param {{ fetchedAt?: number | null }} [opts]
 *   fetchedAt — время облачного успеха; null/omit → сохранить прежний fetchedAt (или 0).
 * @returns {{ ok: true, doc: object, fetchedAt: number } | { ok: false, error: string }}
 */
export function writePriceListLocal(clubId, doc, opts = {}) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, error: 'Не выбран клуб' }
  if (typeof localStorage === 'undefined') return { ok: false, error: 'Нет localStorage' }
  try {
    const prev = readPriceListLocalEntry(id)
    const next = normalizePriceListDocument(
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
    localStorage.setItem(priceListStorageKey(id), JSON.stringify(wrapPriceListLocalCache(next, fetchedAt)))
    return { ok: true, doc: next, fetchedAt }
  } catch {
    return { ok: false, error: 'Не удалось сохранить прайс' }
  }
}

export { PRICE_LIST_CLOUD_TTL_MS, isPriceListCloudFresh }
