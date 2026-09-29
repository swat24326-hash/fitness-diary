/**
 * Чтение .xls/.xlsx прайса ТЗ → документ. `xlsx` грузится лениво (не в основном бандле).
 */

import {
  importTzPriceListFromSheetRows,
  pickTzPriceSheetNames,
} from './tzPriceListExcelImportCore.js'

/**
 * @param {ArrayBuffer | Buffer | Uint8Array} data
 * @param {{ clubId?: string }} [opts]
 */
export async function importTzPriceListFromExcelBuffer(data, opts = {}) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'buffer', cellDates: true })
  const { month1, promo } = pickTzPriceSheetNames(wb.SheetNames)
  if (!month1 && !promo) {
    return {
      ok: false,
      error: `Нет листов «ТЗ 1мес» / «ТЗ акции». Листы: ${wb.SheetNames.join(', ') || '—'}`,
    }
  }

  const month1Rows = month1
    ? XLSX.utils.sheet_to_json(wb.Sheets[month1], { header: 1, defval: '', raw: false })
    : []
  const promoRows = promo
    ? XLSX.utils.sheet_to_json(wb.Sheets[promo], { header: 1, defval: '', raw: false })
    : []

  return importTzPriceListFromSheetRows({
    month1Rows,
    promoRows,
    clubId: opts.clubId,
  })
}
