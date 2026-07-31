/**
 * Шапка и подвал витрины прайса АЗ — для печати/PNG (как у ПЗ/ТЗ).
 */

import {
  formatPriceListMoney,
  formatPriceListValidFromRu,
} from './priceListExportCore.js'
import {
  getAzPriceListCell,
  normalizeAzPriceListDocument,
} from './azPriceListCore.js'

/**
 * @param {object} doc
 * @param {{ sheetLabel?: string }} [opts]
 */
export function buildAzPriceListPrintCap(doc, opts = {}) {
  const normalized = normalizeAzPriceListDocument(doc, doc?.club_id)
  const meta = normalized.meta && typeof normalized.meta === 'object' ? normalized.meta : {}
  const addressLines = Array.isArray(meta.address_lines)
    ? meta.address_lines.map((s) => String(s ?? '').trim()).filter(Boolean)
    : []
  const phones = Array.isArray(meta.phones)
    ? meta.phones.map((s) => String(s ?? '').trim()).filter(Boolean)
    : []
  const title = String(meta.title ?? '').trim() || 'Зал групповых программ'
  return {
    title,
    sheetLabel: String(opts.sheetLabel ?? '').trim(),
    address: addressLines.join(', '),
    phone: phones.join('; '),
    addressLines,
    phones,
  }
}

/**
 * Подвал: Результат+ / разовое / даты.
 * @param {object} doc
 */
export function buildAzPriceListPrintBasement(doc) {
  const normalized = normalizeAzPriceListDocument(doc, doc?.club_id)
  const extras = normalized.extras && typeof normalized.extras === 'object' ? normalized.extras : {}

  const resultPlus =
    extras.result_plus != null && extras.result_plus !== ''
      ? `Результат+  ${formatPriceListMoney(extras.result_plus)}`
      : ''
  const oneTime =
    extras.one_time_result_plus != null && extras.one_time_result_plus !== ''
      ? `Разовое Результат+  ${formatPriceListMoney(extras.one_time_result_plus)}`
      : ''

  const validFrom = formatPriceListValidFromRu(normalized.valid_from)
  const validLine = validFrom ? `Цены действительны с ${validFrom}` : ''

  return {
    resultPlusLine: resultPlus,
    oneTimeLine: oneTime,
    validLine,
    hasContent: Boolean(resultPlus || oneTime || validLine),
  }
}

/**
 * @param {object} doc
 * @param {Array<{ id: string }>} directions
 */
function directionGridHasPrices(doc, directions) {
  const n = normalizeAzPriceListDocument(doc)
  const sessions = n.session_counts ?? []
  if (!directions?.length || !sessions.length) return false
  for (const d of directions) {
    for (const s of sessions) {
      const cell = getAzPriceListCell(n, { sessions: s, directionId: d.id })
      if (cell.price_full != null || cell.price_10 != null) return true
    }
  }
  return false
}

/**
 * Все заполненные листы (не только текущая вкладка UI).
 * @param {object} doc
 * @returns {Array<{ slug: string, sheetLabel: string, kind: 'result' | 'classes' | 'fees' }>}
 */
export function buildAzPriceListPrintSheets(doc) {
  const normalized = normalizeAzPriceListDocument(doc, doc?.club_id)
  /** @type {Array<{ slug: string, sheetLabel: string, kind: 'result' | 'classes' | 'fees' }>} */
  const sheets = []
  if (directionGridHasPrices(normalized, normalized.result_directions)) {
    sheets.push({ slug: 'result', sheetLabel: 'Результат', kind: 'result' })
  }
  if (directionGridHasPrices(normalized, normalized.class_directions)) {
    sheets.push({ slug: 'classes', sheetLabel: 'Групповые', kind: 'classes' })
  }
  const fees = normalized.extras?.other_fees ?? []
  if (fees.length || normalized.extras?.evening_pt_surcharge != null) {
    sheets.push({ slug: 'fees', sheetLabel: 'Доплаты', kind: 'fees' })
  }
  return sheets
}

/**
 * Имя PNG: az-price-{club}-{result|classes|fees}-{YYYY-MM-DD}.png
 * @param {{ clubId?: string, validFrom?: string | null, sheetSlug?: string }} p
 */
export function buildAzPriceListPngFileName(p = {}) {
  const club =
    String(p.clubId ?? 'club')
      .trim()
      .replace(/[^\w-]+/g, '_')
      .slice(0, 24) || 'club'
  const date = String(p.validFrom ?? '')
    .slice(0, 10)
    .replace(/[^\d-]/g, '')
  const stamp = date || new Date().toISOString().slice(0, 10)
  const sheet =
    String(p.sheetSlug ?? '')
      .trim()
      .replace(/[^\w-]+/g, '_')
      .slice(0, 24) || 'sheet'
  return `az-price-${club}-${sheet}-${stamp}.png`
}
