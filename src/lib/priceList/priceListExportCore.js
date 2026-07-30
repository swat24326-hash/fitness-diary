/**
 * Имена файлов и подписи для экспорта прайса (чистые функции).
 */

import { normalizePriceListMode } from './priceListCore.js'

/** @param {unknown} n */
export function formatPriceListMoney(n) {
  if (n == null || n === '') return '—'
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** @param {unknown} mode */
export function priceListModePrintLabel(mode) {
  return normalizePriceListMode(mode) === 'day' ? 'Дневная скидка' : 'Базовая сетка'
}

/** @param {unknown} iso */
export function formatPriceListValidFromRu(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(iso ?? '').trim()
  return `${m[3]}.${m[2]}.${m[1]}`
}

/**
 * @param {{ clubId?: string, mode?: string, validFrom?: string | null, sheetSlug?: string }} p
 */
export function buildPriceListPngFileName(p = {}) {
  const club = String(p.clubId ?? 'club')
    .trim()
    .replace(/[^\w-]+/g, '_')
    .slice(0, 24) || 'club'
  const mode = normalizePriceListMode(p.mode)
  const date = String(p.validFrom ?? '')
    .slice(0, 10)
    .replace(/[^\d-]/g, '')
  const stamp = date || new Date().toISOString().slice(0, 10)
  const sheet = String(p.sheetSlug ?? '')
    .trim()
    .replace(/[^\w-]+/g, '_')
    .slice(0, 24)
  return sheet
    ? `price-${club}-${mode}-${sheet}-${stamp}.png`
    : `price-${club}-${mode}-${stamp}.png`
}
