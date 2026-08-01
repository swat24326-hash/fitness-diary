/**
 * xlsx → desk closing AOA.
 */

import { parseClosingAgreementsAoA } from './deskClosingImportCore.js'

/**
 * @param {ArrayBuffer | Uint8Array} data
 */
export async function parseDeskClosingXlsxArrayBuffer(data) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array', cellDates: true })
  const name = wb.SheetNames?.[0]
  if (!name) return { rows: [], reasons: ['Нет листов'], headerMap: {} }
  const sheet = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
  return parseClosingAgreementsAoA(rows)
}

/**
 * @param {File | Blob} file
 */
export async function parseDeskClosingXlsxFile(file) {
  return parseDeskClosingXlsxArrayBuffer(await file.arrayBuffer())
}
