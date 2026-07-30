/**
 * Локальное хранение прайса по клубу (MVP до облака).
 * Не трогает sync / IndexedDB планшета.
 */

import { emptyPriceListDocument, normalizePriceListDocument } from './priceListCore.js'

const PREFIX = 'os-price-list:v1:'

/** @param {string} clubId */
export function priceListStorageKey(clubId) {
  return `${PREFIX}${String(clubId ?? '').trim()}`
}

/**
 * @param {string} clubId
 * @returns {object}
 */
export function readPriceListLocal(clubId) {
  const id = String(clubId ?? '').trim()
  if (!id || typeof localStorage === 'undefined') return emptyPriceListDocument({ club_id: id })
  try {
    const raw = localStorage.getItem(priceListStorageKey(id))
    if (!raw) return emptyPriceListDocument({ club_id: id })
    return normalizePriceListDocument(JSON.parse(raw), id)
  } catch {
    return emptyPriceListDocument({ club_id: id })
  }
}

/**
 * @param {string} clubId
 * @param {object} doc
 * @returns {{ ok: true, doc: object } | { ok: false, error: string }}
 */
export function writePriceListLocal(clubId, doc) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, error: 'Не выбран клуб' }
  if (typeof localStorage === 'undefined') return { ok: false, error: 'Нет localStorage' }
  try {
    const next = normalizePriceListDocument(
      { ...doc, club_id: id, updated_at: new Date().toISOString() },
      id,
    )
    localStorage.setItem(priceListStorageKey(id), JSON.stringify(next))
    return { ok: true, doc: next }
  } catch {
    return { ok: false, error: 'Не удалось сохранить прайс' }
  }
}
