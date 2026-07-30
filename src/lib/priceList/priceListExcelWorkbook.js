/**
 * Чтение .xlsx → листы AOA (браузер / Node). Зависит от `xlsx`.
 */

import * as XLSX from 'xlsx'
import { parsePriceListWorkbookSheets } from './priceListExcelImportCore.js'

/**
 * @param {ArrayBuffer | Uint8Array} data
 * @returns {Array<{ name: string, rows: unknown[][] }>}
 */
export function workbookSheetsFromArrayBuffer(data) {
  const wb = XLSX.read(data, { type: 'array', cellDates: false })
  return (wb.SheetNames ?? []).map((name) => {
    const sheet = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
    return { name, rows }
  })
}

/**
 * @param {ArrayBuffer | Uint8Array} data
 */
export function parsePriceListXlsxArrayBuffer(data) {
  const sheets = workbookSheetsFromArrayBuffer(data)
  return parsePriceListWorkbookSheets(sheets)
}

/**
 * @param {File | Blob} file
 */
export async function parsePriceListXlsxFile(file) {
  const buf = await file.arrayBuffer()
  return parsePriceListXlsxArrayBuffer(buf)
}
