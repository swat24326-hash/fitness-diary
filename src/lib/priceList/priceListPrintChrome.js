/**
 * Шапка и подвал витрины прайса (как в Excel ПЗ) — чистые данные для печати/PNG.
 */

import { normalizePriceListMode } from './priceListCore.js'
import {
  formatPriceListMoney,
  formatPriceListValidFromRu,
  priceListModePrintLabel,
} from './priceListExportCore.js'

/**
 * Подзаголовок как в Excel: «Базовая стоимость абонемента».
 * @param {unknown} mode
 */
export function priceListModeStandSubtitle(mode) {
  return normalizePriceListMode(mode) === 'day'
    ? 'Дневная стоимость абонемента'
    : 'Базовая стоимость абонемента'
}

/**
 * @param {object} doc
 * @param {{ mode?: string, sheetLabel?: string }} [opts]
 */
export function buildPriceListPrintCap(doc, opts = {}) {
  const mode = normalizePriceListMode(opts.mode)
  const meta = doc?.meta && typeof doc.meta === 'object' ? doc.meta : {}
  const address = String(meta.address ?? '').trim()
  const phone = String(meta.phone ?? '').trim()
  const title = String(meta.title ?? '').trim() || 'Персональный зал'
  return {
    title,
    subtitle: priceListModeStandSubtitle(mode),
    modeLabel: priceListModePrintLabel(mode),
    sheetLabel: String(opts.sheetLabel ?? '').trim(),
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
 * Подвал: разовое / клубная карта / даты.
 * @param {object} doc
 */
export function buildPriceListPrintBasement(doc) {
  const extras = doc?.extras && typeof doc.extras === 'object' ? doc.extras : {}
  const one = extras.one_time && typeof extras.one_time === 'object' ? extras.one_time : {}
  const oneBase = one.base != null ? formatPriceListMoney(one.base) : null
  const oneDay = one.day != null ? formatPriceListMoney(one.day) : null
  let oneTimeLine = ''
  if (oneBase && oneDay) oneTimeLine = `Разовое занятие  ${oneBase}  /  ${oneDay}`
  else if (oneBase) oneTimeLine = `Разовое занятие  ${oneBase}`
  else if (oneDay) oneTimeLine = `Разовое занятие (день)  ${oneDay}`

  const club =
    extras.club_card != null && extras.club_card !== ''
      ? `Клубная карта  ${formatPriceListMoney(extras.club_card)}`
      : ''

  const validFrom = formatPriceListValidFromRu(doc?.valid_from)
  const validLine = validFrom ? `Цены действительны с ${validFrom}` : ''

  return {
    oneTimeLine,
    clubCardLine: club,
    validLine,
    hasContent: Boolean(oneTimeLine || club || validLine),
  }
}
