/**
 * Чтение .xlsx прайса АЗ → документ.
 */

import * as XLSX from 'xlsx'
import {
  importAzPriceListFromSheetRows,
  pickAzPriceSheetNames,
} from './azPriceListExcelImportCore.js'

/**
 * @param {ArrayBuffer | Buffer | Uint8Array} data
 * @param {{ clubId?: string }} [opts]
 */
export function importAzPriceListFromExcelBuffer(data, opts = {}) {
  const wb = XLSX.read(data, { type: 'buffer', cellDates: true })
  const { result, classes, fees } = pickAzPriceSheetNames(wb.SheetNames)
  if (!result && !classes) {
    return {
      ok: false,
      error: `Нет листов «АЗ» / «Лист1». Листы: ${wb.SheetNames.join(', ') || '—'}`,
    }
  }

  const resultRows = result
    ? XLSX.utils.sheet_to_json(wb.Sheets[result], { header: 1, defval: '', raw: false })
    : []
  const classRows = classes
    ? XLSX.utils.sheet_to_json(wb.Sheets[classes], { header: 1, defval: '', raw: false })
    : []
  const feeRows = fees
    ? XLSX.utils.sheet_to_json(wb.Sheets[fees], { header: 1, defval: '', raw: false })
    : []

  return importAzPriceListFromSheetRows({
    resultRows,
    classRows,
    feeRows,
    clubId: opts.clubId,
  })
}
