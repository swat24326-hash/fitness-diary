/**
 * Дата из отчётов 1С (оплаты / часы ПЗ): период «с — по», Excel-serial.
 * Чистая логика без React / xlsx.
 */

/** Excel serial 30000 ≈ 1982, 60000 ≈ 2064 — не путать с суммами в ₽. */
const EXCEL_SERIAL_MIN = 30000
const EXCEL_SERIAL_MAX = 60000

/**
 * @param {number} serial
 * @returns {string|null} YYYY-MM-DD
 */
export function excelSerialToIso(serial) {
  const n = Number(serial)
  if (!Number.isFinite(n) || n < EXCEL_SERIAL_MIN || n > EXCEL_SERIAL_MAX) return null
  const utc = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000
  const d = new Date(utc)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {Date} date
 * @returns {string|null} YYYY-MM-DD
 */
export function dateObjectToIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  if (y < 1990 || y > 2100) return null
  return `${y}-${m}-${day}`
}

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {string} DD.MM.YYYY
 */
export function isoToRuDotDate(iso) {
  const s = String(iso ?? '').slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[3]}.${m[2]}.${m[1]}`
}

/**
 * «Период: 31.07.2026 - 31.07.2026» или две даты через тире.
 * @param {string} text
 * @returns {{ start: string, end: string } | null}
 */
export function parse1cPeriodRange(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-–—]\s*(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return null
  const start = `${m[3]}-${m[2]}-${m[1]}`
  const end = `${m[6]}-${m[5]}-${m[4]}`
  return { start, end }
}

/**
 * Дата одного дня из периода 1С. Диапазон разных дат → null.
 * @param {string} text
 * @returns {string|null} YYYY-MM-DD
 */
export function parse1cPeriodSameDay(text) {
  const range = parse1cPeriodRange(text)
  if (!range) return null
  if (range.start !== range.end) return null
  return range.start
}

/**
 * Ячейка Excel → текст, даты (Date / serial) как ДД.ММ.ГГГГ.
 * @param {unknown} cell
 * @returns {string}
 */
export function salesImportCellText(cell) {
  if (cell == null) return ''
  const fromDate = dateObjectToIso(cell)
  if (fromDate) return isoToRuDotDate(fromDate)
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    const serialIso = excelSerialToIso(cell)
    if (serialIso) return isoToRuDotDate(serialIso)
    if (Number.isInteger(cell)) return String(cell)
    return String(cell)
  }
  return String(cell).replace(/\s+/g, ' ').trim()
}

/**
 * Ищет период в AOA (оплаты 31.xlsx).
 * @param {unknown[][]} rows
 * @returns {{ start: string, end: string, sameDay: boolean } | null}
 */
export function parsePaymentsReportPeriod(rows) {
  for (const row of rows ?? []) {
    const texts = []
    /** @type {string[]} */
    const isoFromCells = []
    for (const cell of row ?? []) {
      const dateIso = dateObjectToIso(cell) || (typeof cell === 'number' ? excelSerialToIso(cell) : null)
      if (dateIso) {
        isoFromCells.push(dateIso)
        texts.push(isoToRuDotDate(dateIso))
        continue
      }
      texts.push(salesImportCellText(cell))
    }
    const joined = texts.join(' ')
    const range = parse1cPeriodRange(joined)
    if (range) {
      return { start: range.start, end: range.end, sameDay: range.start === range.end }
    }
    if (isoFromCells.length >= 2 && /период/i.test(joined)) {
      const start = isoFromCells[0]
      const end = isoFromCells[1]
      return { start, end, sameDay: start === end }
    }
    if (isoFromCells.length === 1 && /период/i.test(joined)) {
      const d = isoFromCells[0]
      return { start: d, end: d, sameDay: true }
    }
  }
  return null
}
