/**
 * Сериализация прайса АЗ ↔ Postgres.
 */

import { emptyAzPriceListDocument, normalizeAzPriceListDocument } from './azPriceListCore.js'

/**
 * @param {unknown} row
 * @param {string} clubId
 */
export function azPriceListDocFromDbRow(row, clubId) {
  if (!row || typeof row !== 'object') return emptyAzPriceListDocument({ club_id: clubId })
  const r = /** @type {Record<string, unknown>} */ (row)
  return normalizeAzPriceListDocument(
    {
      club_id: clubId,
      valid_from: r.valid_from ?? null,
      meta: r.meta,
      result_directions: r.result_directions,
      class_directions: r.class_directions,
      session_counts: r.session_counts,
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
export function azPriceListDocToDbRow(doc, clubId, updatedBy) {
  const n = normalizeAzPriceListDocument(doc, clubId)
  return {
    club_id: String(clubId).trim(),
    valid_from: n.valid_from || null,
    meta: n.meta ?? {},
    result_directions: n.result_directions ?? [],
    class_directions: n.class_directions ?? [],
    session_counts: n.session_counts ?? [],
    cells: n.cells ?? {},
    extras: n.extras ?? {},
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ? String(updatedBy) : null,
  }
}
