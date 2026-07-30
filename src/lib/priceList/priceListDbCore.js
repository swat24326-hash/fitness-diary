/**
 * Сериализация прайса ↔ строка Postgres (без React).
 */

import { emptyPriceListDocument, normalizePriceListDocument } from './priceListCore.js'

/**
 * @param {unknown} row
 * @param {string} clubId
 */
export function priceListDocFromDbRow(row, clubId) {
  if (!row || typeof row !== 'object') return emptyPriceListDocument({ club_id: clubId })
  const r = /** @type {Record<string, unknown>} */ (row)
  return normalizePriceListDocument(
    {
      club_id: clubId,
      valid_from: r.valid_from ?? null,
      meta: r.meta,
      sessions: r.sessions,
      people: r.people,
      tariffs: r.tariffs,
      cells: r.cells,
      extras: r.extras,
      updated_at: r.updated_at ?? null,
    },
    clubId,
  )
}

/**
 * @param {object} doc
 * @param {string} clubId
 * @param {string | null | undefined} updatedBy
 */
export function priceListDocToDbRow(doc, clubId, updatedBy) {
  const n = normalizePriceListDocument(doc, clubId)
  return {
    club_id: String(clubId).trim(),
    valid_from: n.valid_from || null,
    meta: n.meta ?? {},
    sessions: n.sessions ?? [],
    people: n.people ?? [],
    tariffs: n.tariffs ?? [],
    cells: n.cells ?? {},
    extras: n.extras ?? {},
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ? String(updatedBy) : null,
  }
}
