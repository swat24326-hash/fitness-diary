/**
 * Шапка и подвал витрины прайса ТЗ (как в Excel) — для печати/PNG.
 * Разовое у ТЗ — одно число (не base/day как у ПЗ).
 */

import {
  formatPriceListMoney,
  formatPriceListValidFromRu,
} from './priceListExportCore.js'
import { normalizeTzPriceListDocument } from './tzPriceListCore.js'

/**
 * @param {object} doc
 * @param {{ sheetLabel?: string, hoursNote?: string }} [opts]
 */
export function buildTzPriceListPrintCap(doc, opts = {}) {
  const normalized = normalizeTzPriceListDocument(doc, doc?.club_id)
  const meta = normalized.meta && typeof normalized.meta === 'object' ? normalized.meta : {}
  const address = String(meta.address ?? '').trim()
  const phone = String(meta.phone ?? '').trim()
  const title = String(meta.title ?? '').trim() || 'Тренажёрный зал'
  const hoursNote = String(opts.hoursNote ?? '').trim()
  return {
    title,
    sheetLabel: String(opts.sheetLabel ?? '').trim(),
    hoursNote,
    address,
    phone,
    addressLines: address
      ? address
          .split(/\n|;\s*/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  }
}

/**
 * Подвал: разовое (scalar) / клубная карта / даты.
 * @param {object} doc
 */
export function buildTzPriceListPrintBasement(doc) {
  const normalized = normalizeTzPriceListDocument(doc, doc?.club_id)
  const extras = normalized.extras && typeof normalized.extras === 'object' ? normalized.extras : {}

  const oneTime =
    extras.one_time != null && extras.one_time !== ''
      ? `Разовое занятие  ${formatPriceListMoney(extras.one_time)}`
      : ''

  const club =
    extras.club_card != null && extras.club_card !== ''
      ? `Клубная карта  ${formatPriceListMoney(extras.club_card)}`
      : ''

  const validFrom = formatPriceListValidFromRu(normalized.valid_from)
  const validLine = validFrom ? `Цены действительны с ${validFrom}` : ''

  return {
    oneTimeLine: oneTime,
    clubCardLine: club,
    validLine,
    hasContent: Boolean(oneTime || club || validLine),
  }
}

/**
 * Какие листы печатать/экспортировать (все заполненные).
 * @param {object} doc
 * @returns {Array<{ slug: string, sheetLabel: string, kind: 'month1' | 'promo' }>}
 */
export function buildTzPriceListPrintSheets(doc) {
  const normalized = normalizeTzPriceListDocument(doc, doc?.club_id)
  /** @type {Array<{ slug: string, sheetLabel: string, kind: 'month1' | 'promo' }>} */
  const sheets = []
  if ((normalized.month1_rows ?? []).length) {
    sheets.push({ slug: 'month1', sheetLabel: '1 месяц', kind: 'month1' })
  }
  if ((normalized.promo_rows ?? []).length) {
    sheets.push({ slug: 'promo', sheetLabel: 'Акции', kind: 'promo' })
  }
  return sheets
}

/**
 * Имя PNG: tz-price-{club}-{month1|promo}-{YYYY-MM-DD}.png
 * @param {{ clubId?: string, validFrom?: string | null, sheetSlug?: string }} p
 */
export function buildTzPriceListPngFileName(p = {}) {
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
  return `tz-price-${club}-${sheet}-${stamp}.png`
}
