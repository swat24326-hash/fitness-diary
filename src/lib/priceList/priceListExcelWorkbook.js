/**
 * Чтение .xlsx → листы AOA. `xlsx` грузится лениво (не в основном бандле).
 */

import { parsePriceListWorkbookSheets } from './priceListExcelImportCore.js'

/**
 * @param {ArrayBuffer | Uint8Array} data
 * @returns {Promise<Array<{ name: string, rows: unknown[][] }>>}
 */
export async function workbookSheetsFromArrayBuffer(data) {
  const XLSX = await import('xlsx')
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
export async function parsePriceListXlsxArrayBuffer(data) {
  const sheets = await workbookSheetsFromArrayBuffer(data)
  return parsePriceListWorkbookSheets(sheets)
}

/**
 * @param {File | Blob} file
 */
export async function parsePriceListXlsxFile(file) {
  const buf = await file.arrayBuffer()
  return parsePriceListXlsxArrayBuffer(buf)
}
