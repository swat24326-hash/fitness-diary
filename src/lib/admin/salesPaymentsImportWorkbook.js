/**
 * xlsx → AOA для отчёта по оплатам (ленивый import('xlsx')).
 */

import { parseSalesPaymentsAoA } from './salesPaymentsImportCore.js'

/**
 * @param {ArrayBuffer | Uint8Array} data
 * @returns {Promise<Array<{ name: string, rows: unknown[][] }>>}
 */
export async function salesPaymentsWorkbookSheetsFromArrayBuffer(data) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array', cellDates: false })
  return (wb.SheetNames ?? []).map((name) => {
    const sheet = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
    return { name, rows }
  })
}

/**
 * Берёт первый лист (или с «оплат» в имени).
 * @param {ArrayBuffer | Uint8Array} data
 */
export async function parseSalesPaymentsXlsxArrayBuffer(data) {
  const sheets = await salesPaymentsWorkbookSheetsFromArrayBuffer(data)
  if (!sheets.length) {
    return {
      reportDate: null,
      periodStart: null,
      periodEnd: null,
      periodRange: false,
      lines: [],
      fileTotal: null,
      linesSum: 0,
      refundsAmount: 0,
      reasons: ['Файл без листов'],
    }
  }
  const preferred =
    sheets.find((s) => /оплат|приход|продаж/i.test(s.name)) ??
    sheets.find((s) => /лист1|sheet1/i.test(s.name)) ??
    sheets[0]
  return parseSalesPaymentsAoA(preferred.rows)
}

/**
 * @param {File | Blob} file
 */
export async function parseSalesPaymentsXlsxFile(file) {
  const buf = await file.arrayBuffer()
  return parseSalesPaymentsXlsxArrayBuffer(buf)
}
