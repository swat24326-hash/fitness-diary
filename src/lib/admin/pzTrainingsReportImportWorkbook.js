/**
 * xlsx → AOA для отчёта часов ПЗ (ленивый import('xlsx')).
 */

import { parsePzTrainingsReportAoA } from './pzTrainingsReportImportCore.js'

/**
 * @param {ArrayBuffer | Uint8Array} data
 */
async function sheetsFromArrayBuffer(data) {
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
 * @param {{ trainers?: object[], membershipTypes?: object[] }} [opts]
 */
export async function parsePzTrainingsReportXlsxArrayBuffer(data, opts = {}) {
  const sheets = await sheetsFromArrayBuffer(data)
  if (!sheets.length) {
    return {
      ok: false,
      error: 'Файл без листов',
      reportDate: null,
      fileTotal: 0,
      matchedTotal: 0,
      matrixInput: {},
      unmatchedTrainers: [],
      unmatchedColumns: [],
      matchedTrainers: [],
    }
  }
  const preferred =
    sheets.find((s) => /пз|персонал|тренер/i.test(s.name)) ??
    sheets.find((s) => /лист1|sheet1/i.test(s.name)) ??
    sheets[0]
  return parsePzTrainingsReportAoA(preferred.rows, opts)
}

/**
 * @param {File | Blob} file
 * @param {{ trainers?: object[], membershipTypes?: object[] }} [opts]
 */
export async function parsePzTrainingsReportXlsxFile(file, opts = {}) {
  const buf = await file.arrayBuffer()
  return parsePzTrainingsReportXlsxArrayBuffer(buf, opts)
}
