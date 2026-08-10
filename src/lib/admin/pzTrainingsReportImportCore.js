/**
 * Импорт Excel «отчёт ПЗ» (otchet_pz.xlsx) → матрица тренер × тип.
 * Чистая логика без React / IDB / xlsx. Контур отчёта продаж ≠ статистика планшетов.
 */

import {
  salesTrainingCellKey,
  SALES_TRAINING_TYPE_NONE,
} from './salesTrainingsMatrix.js'
import { foldLatinCyrillicLookalikes } from './textMatchNormalizeCore.js'

/**
 * @param {unknown} cell
 * @returns {string}
 */
export function pzReportCellText(cell) {
  if (cell == null) return ''
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    if (Number.isInteger(cell)) return String(cell)
    return String(cell)
  }
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const d = String(cell.getDate()).padStart(2, '0')
    const m = String(cell.getMonth() + 1).padStart(2, '0')
    return `${d}.${m}.${cell.getFullYear()}`
  }
  return String(cell).trim()
}

/**
 * @param {string} text
 * @returns {string|null} YYYY-MM-DD
 */
export function parsePzReportPeriodDate(text) {
  const s = pzReportCellText(text)
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}

/** @param {string} raw */
export function normalizePzTypeCodeKey(raw) {
  return foldLatinCyrillicLookalikes(
    pzReportCellText(raw)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[.\s_-]+/g, '')
      .replace(/^vip(?=\d)/, 'vip'),
  )
}

/**
 * Синонимы заголовков 1С → канон для матча с code типов в Оси.
 * @param {string} raw
 */
export function canonicalizePzExcelTypeHeader(raw) {
  const k = normalizePzTypeCodeKey(raw)
  if (!k || k === 'итого' || k === 'itogo' || k === 'total') return null
  if (k === 'см' || k === 'cm') return 'cm'
  if (k === 'brilliant' || k === 'br') return 'br'
  if (k === 'diamond' || k === 'dm') return 'dm'
  if (k === 'elite' || k === 'el') return 'el'
  if (k === 'vip3' || k === 'vipiii') return 'vip3'
  if (k === 'vip2' || k === 'vipii') return 'vip2'
  if (k === 'vip1' || k === 'vip' || k === 'vipi') return 'vip1'
  if (k === 'bz' || k === 'бз') return 'bz'
  if (k === 'pl' || k === 'platinum') return 'pl'
  return k
}

/** @param {string} name */
export function normalizeTrainerNameKey(name) {
  return pzReportCellText(name)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u00a0\u202f\u2007\u2009\u200a]/g, ' ')
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Ключ без порядка слов: 1С часто «Фамилия Имя», в карточке — «Имя Фамилия».
 * @param {string} name
 */
export function trainerNameTokensKey(name) {
  const parts = normalizeTrainerNameKey(name).split(' ').filter(Boolean)
  if (!parts.length) return ''
  return [...parts].sort().join(' ')
}

/**
 * @param {string} excelName
 * @param {Array<{ id: string, name?: string, email?: string }>} trainers
 * @returns {{ id: string, name: string }|null}
 */
export function matchTrainerByExcelName(excelName, trainers) {
  const key = normalizeTrainerNameKey(excelName)
  if (!key) return null
  const list = trainers ?? []
  const pick = (t) => ({ id: String(t.id), name: String(t.name ?? '').trim() })

  for (const t of list) {
    const n = normalizeTrainerNameKey(t?.name ?? '')
    if (n && n === key) return pick(t)
  }

  const excelTokensKey = trainerNameTokensKey(excelName)
  if (excelTokensKey.includes(' ')) {
    for (const t of list) {
      const n = normalizeTrainerNameKey(t?.name ?? '')
      if (!n || !n.includes(' ')) continue
      if (trainerNameTokensKey(n) === excelTokensKey) return pick(t)
    }
  }

  for (const t of list) {
    const n = normalizeTrainerNameKey(t?.name ?? '')
    if (!n) continue
    if (n.startsWith(key) || key.startsWith(n)) return pick(t)
  }

  const keyParts = key.split(' ').filter(Boolean)
  if (keyParts.length >= 2) {
    for (const t of list) {
      const n = normalizeTrainerNameKey(t?.name ?? '')
      const parts = n.split(' ').filter(Boolean)
      if (parts.length >= 2 && parts[0] === keyParts[0] && parts[1] === keyParts[1]) {
        return pick(t)
      }
    }
  }
  return null
}

/**
 * @param {string} excelHeader
 * @param {Array<{ id: string, code?: string, trainer_assignable?: boolean }>} membershipTypes
 */
export function matchMembershipTypeByExcelHeader(excelHeader, membershipTypes) {
  const canon = canonicalizePzExcelTypeHeader(excelHeader)
  if (!canon) return null
  const types = (membershipTypes ?? []).filter((t) => t?.trainer_assignable !== false)
  for (const t of types) {
    const codeKey = normalizePzTypeCodeKey(t?.code ?? '')
    const codeCanon = canonicalizePzExcelTypeHeader(t?.code ?? '')
    if (codeKey === canon || codeCanon === canon) {
      return { id: String(t.id), code: String(t.code ?? '').trim() || '—' }
    }
  }
  return null
}

/**
 * @param {unknown[][]} aoa
 * @param {{
 *   trainers?: Array<{ id: string, name?: string }>,
 *   membershipTypes?: Array<{ id: string, code?: string, trainer_assignable?: boolean }>,
 * }} [opts]
 */
export function parsePzTrainingsReportAoA(aoa, opts = {}) {
  const rows = Array.isArray(aoa) ? aoa : []
  const trainers = opts.trainers ?? []
  const membershipTypes = opts.membershipTypes ?? []

  let reportDate = null
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const line = (rows[i] ?? []).map(pzReportCellText).join(' ')
    const d = parsePzReportPeriodDate(line)
    if (d) {
      reportDate = d
      break
    }
  }

  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const c0 = pzReportCellText(rows[i]?.[0]).toLowerCase()
    if (c0 === 'тренер' || c0.startsWith('тренер')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) {
    return {
      ok: false,
      error: 'Не найдена строка «Тренер» с типами карт',
      reportDate,
      fileTotal: 0,
      matchedTotal: 0,
      matrixInput: {},
      unmatchedTrainers: [],
      unmatchedColumns: [],
      matchedTrainers: [],
    }
  }

  const headerRow = rows[headerIdx] ?? []
  /** @type {Array<{ col: number, typeId: string, code: string }>} */
  const typeCols = []
  /** @type {string[]} */
  const unmatchedColumns = []
  for (let c = 1; c < headerRow.length; c++) {
    const label = pzReportCellText(headerRow[c])
    if (!label) continue
    const low = label.toLowerCase().replace(/\s+/g, '')
    if (low === 'итого' || low === 'total') continue
    const matched = matchMembershipTypeByExcelHeader(label, membershipTypes)
    if (matched) typeCols.push({ col: c, typeId: matched.id, code: matched.code })
    else unmatchedColumns.push(label)
  }

  /** @type {Record<string, string>} */
  const matrixInput = {}
  /** @type {string[]} */
  const unmatchedTrainers = []
  /** @type {Array<{ id: string, name: string, total: number }>} */
  const matchedTrainers = []
  let matchedTotal = 0
  let fileTotal = 0

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const name = pzReportCellText(row[0])
    if (!name) continue
    const nameLow = name.toLowerCase()
    if (nameLow === 'итого' || nameLow === 'total') {
      const last = row[row.length - 1]
      const n = Math.floor(Number(String(last).replace(/\s/g, '').replace(',', '.')))
      if (Number.isFinite(n) && n > 0) fileTotal = n
      continue
    }
    // skip subtitle row «Кол занятий…»
    if (/кол\s*занят/i.test(name) || name.startsWith('Кол')) continue

    const trainer = matchTrainerByExcelName(name, trainers)
    if (!trainer) {
      unmatchedTrainers.push(name)
      continue
    }
    let rowSum = 0
    for (const tc of typeCols) {
      const raw = row[tc.col]
      const n = Math.floor(Number(String(raw ?? '').replace(/\s/g, '').replace(',', '.')))
      if (!Number.isFinite(n) || n <= 0) continue
      const key = salesTrainingCellKey(trainer.id, tc.typeId)
      matrixInput[key] = String((Number(matrixInput[key]) || 0) + n)
      rowSum += n
      matchedTotal += n
    }
    matchedTrainers.push({ id: trainer.id, name: trainer.name || name, total: rowSum })
  }

  if (!fileTotal) fileTotal = matchedTotal

  return {
    ok: true,
    error: null,
    reportDate,
    fileTotal,
    matchedTotal,
    matrixInput,
    unmatchedTrainers,
    unmatchedColumns,
    matchedTrainers,
  }
}

/**
 * @param {Record<string, string>} matrixInput
 * @param {string} reportDateIso
 * @param {string} formReportDateIso
 */
export function pzTrainingsReportDateMatches(reportDateIso, formReportDateIso) {
  const a = String(reportDateIso ?? '').slice(0, 10)
  const b = String(formReportDateIso ?? '').slice(0, 10)
  return Boolean(a && b && a === b)
}

export { SALES_TRAINING_TYPE_NONE, salesTrainingCellKey }
