/**
 * xlsx → desk closing AOA.
 * Несколько листов (июнь/июль/август) — склеиваем строки.
 */

import { parseClosingAgreementsAoA } from './deskClosingImportCore.js'

/**
 * @param {ArrayBuffer | Uint8Array} data
 */
export async function parseDeskClosingXlsxArrayBuffer(data) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array', cellDates: true })
  const names = wb.SheetNames ?? []
  if (!names.length) return { rows: [], reasons: ['Нет листов'], headerMap: {} }

  /** @type {ReturnType<typeof parseClosingAgreementsAoA>['rows']} */
  const merged = []
  /** @type {string[]} */
  const reasons = []
  /** @type {Record<string, number>} */
  let headerMap = {}
  const seenCardEnd = new Set()

  for (const name of names) {
    const sheet = wb.Sheets[name]
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
    const parsed = parseClosingAgreementsAoA(aoa)
    if (!parsed.rows.length) {
      if (parsed.reasons?.[0]) reasons.push(`Лист «${name}»: ${parsed.reasons[0]}`)
      continue
    }
    headerMap = parsed.headerMap
    for (const row of parsed.rows) {
      const key = `${row.cardNumber}|${row.endDate || ''}`
      if (seenCardEnd.has(key)) continue
      seenCardEnd.add(key)
      merged.push(row)
    }
  }

  if (!merged.length) {
    return {
      rows: [],
      reasons: reasons.length ? reasons : ['Не найдены колонки «карта» (+ ФИО или дата окончания).'],
      headerMap: {},
    }
  }
  if (names.length > 1) {
    reasons.unshift(`Листов: ${names.length}, уникальных строк: ${merged.length}`)
  }
  return { rows: merged, reasons, headerMap }
}

/**
 * @param {File | Blob} file
 */
export async function parseDeskClosingXlsxFile(file) {
  return parseDeskClosingXlsxArrayBuffer(await file.arrayBuffer())
}
