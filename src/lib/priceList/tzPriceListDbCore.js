/**
 * Сериализация прайса ТЗ ↔ Postgres.
 */

import { emptyTzPriceListDocument, normalizeTzPriceListDocument } from './tzPriceListCore.js'

/**
 * @param {unknown} row
 * @param {string} clubId
 */
export function tzPriceListDocFromDbRow(row, clubId) {
  if (!row || typeof row !== 'object') return emptyTzPriceListDocument({ club_id: clubId })
  const r = /** @type {Record<string, unknown>} */ (row)
  return normalizeTzPriceListDocument(
    {
      club_id: clubId,
      valid_from: r.valid_from ?? null,
      meta: r.meta,
      month1_rows: r.month1_rows,
      promo_rows: r.promo_rows,
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
export function tzPriceListDocToDbRow(doc, clubId, updatedBy) {
  const n = normalizeTzPriceListDocument(doc, clubId)
  return {
    club_id: String(clubId).trim(),
    valid_from: n.valid_from || null,
    meta: n.meta ?? {},
    month1_rows: n.month1_rows ?? [],
    promo_rows: n.promo_rows ?? [],
    extras: n.extras ?? {},
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ? String(updatedBy) : null,
  }
}
