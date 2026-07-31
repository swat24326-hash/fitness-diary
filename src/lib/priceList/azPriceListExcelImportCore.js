/**
 * Импорт прайса АЗ из Excel (эталон az-price-1kfs.xlsx).
 */

import {
  emptyAzPriceListDocument,
  normalizeAzPriceListDocument,
  parseAzMoney,
  parseAzSessions,
  parseAzValidFrom,
  slugAzDirection,
  azPriceListCellKey,
} from './azPriceListCore.js'

/**
 * @param {unknown[][]} rows
 * @param {number} r
 * @param {number} c
 */
function cell(rows, r, c) {
  const row = rows[r]
  if (!row) return ''
  const v = row[c]
  return v == null ? '' : v
}

/**
 * @param {unknown[][]} rows
 * @param {RegExp} re
 */
function findRowIndex(rows, re) {
  for (let i = 0; i < rows.length; i++) {
    const joined = (rows[i] ?? []).map((x) => String(x ?? '')).join(' ')
    if (re.test(joined)) return i
  }
  return -1
}

/**
 * @param {string} raw
 */
function cleanLabel(raw) {
  return String(raw ?? '')
    .replace(/\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Базовая подпись без «ск10%».
 * @param {string} raw
 */
function baseDirectionLabel(raw) {
  return cleanLabel(raw)
    .replace(/ск\s*10\s*%/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Колонка «стенд / −10%»?
 * @param {string} raw
 */
function isStandHeader(raw) {
  return /ск\s*10\s*%/i.test(String(raw ?? ''))
}

/**
 * Служебные колонки extras, не направления пакета.
 * @param {string} label
 */
function isExtraColumn(label) {
  const s = cleanLabel(label).toLowerCase().replace(/ё/g, 'е')
  if (/разовое/.test(s)) return 'one_time_result_plus'
  // «Результат+» без цифры 1/2/3 — отдельная цена, не пакет
  if (/^результат\+?$/.test(s) || /^результат\+$/.test(s.replace(/\s/g, ''))) {
    return 'result_plus'
  }
  const compact = s.replace(/\s/g, '')
  if (compact === 'результат+' || compact === 'результат') return 'result_plus'
  if (/^результат\+$/.test(compact)) return 'result_plus'
  // точное: Результат+ без 1/2/3
  if (/результат\+/.test(s) && !/результат\s*[123]\+/.test(s) && !/результат[123]\+/.test(compact)) {
    return 'result_plus'
  }
  return null
}

/**
 * @param {string[]} names
 */
export function pickAzPriceSheetNames(names) {
  const list = Array.isArray(names) ? names.map(String) : []
  const result =
    list.find((n) => /^аз$/i.test(n.trim())) ||
    list.find((n) => /зал\s*групп|аэроб|az/i.test(n) && !/доплат/i.test(n)) ||
    null
  const classes =
    list.find((n) => /^лист\s*1$/i.test(n.trim())) ||
    list.find((n) => /йога|бокс|степ/i.test(n)) ||
    null
  const fees = list.find((n) => /доплат/i.test(n)) || null
  return { result, classes, fees }
}

/**
 * Шапка: адресные строки + телефоны.
 * @param {unknown[][]} rows
 */
export function parseAzStandHeader(rows) {
  /** @type {string[]} */
  const address_lines = []
  /** @type {string[]} */
  const phones = []
  let title = 'Зал групповых программ'

  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const raw = cleanLabel(cell(rows, i, 0) || cell(rows, i, 1))
    if (!raw) continue
    if (/зал\s+групповых/i.test(raw)) {
      title = 'Зал групповых программ'
      continue
    }
    if (/тел|8[\d\-–—\s]{8,}|7[\d\-–—\s]{8,}|\+7|304[-\s]?770/i.test(raw) && !/клинц|кюстен|галере/i.test(raw)) {
      const parts = raw
        .split(/;|,/)
        .map((s) => s.replace(/тел\.?:?/gi, '').trim())
        .filter(Boolean)
      for (const p of parts) {
        if (/[\d]/.test(p)) phones.push(p.replace(/;+$/, '').trim())
      }
      continue
    }
    if (/клинц|кюстен|галере|ул\.|тц/i.test(raw) || (raw.length < 80 && !/стоимость|количеств|направл/i.test(raw))) {
      if (!/цены\s+действительн/i.test(raw)) address_lines.push(raw.replace(/;+$/, '').trim())
    }
  }

  return {
    title,
    address_lines: [...new Set(address_lines)].slice(0, 6),
    phones: [...new Set(phones)].slice(0, 4),
  }
}

/**
 * Разбор сетки направлений (лист АЗ или Лист1).
 * @param {unknown[][]} rows
 * @param {'result' | 'classes'} kind
 */
export function parseAzDirectionsSheet(rows, kind) {
  const headerRow = findRowIndex(rows, /результат1\+|йога|бокс|степ|результат2\+/i)
  if (headerRow < 0) {
    return { directions: [], session_counts: [], cells: {}, extras: {} }
  }

  /** @type {Array<{ colFull: number, colStand: number | null, id: string, label: string, extraKey?: string }>} */
  const cols = []
  const header = rows[headerRow] ?? []
  let c = 2
  while (c < header.length) {
    const raw = cleanLabel(header[c])
    if (!raw) {
      c += 1
      continue
    }
    const extraKey = isExtraColumn(raw)
    if (extraKey) {
      cols.push({
        colFull: c,
        colStand: null,
        id: extraKey,
        label: raw,
        extraKey,
      })
      c += 1
      continue
    }
    if (isStandHeader(raw)) {
      // одиночный стенд без пары — пропускаем / привяжем к предыдущему
      c += 1
      continue
    }
    const label = baseDirectionLabel(raw)
    if (!label) {
      c += 1
      continue
    }
    const nextRaw = cleanLabel(header[c + 1])
    const standCol = isStandHeader(nextRaw) ? c + 1 : null
    const id = slugAzDirection(label, `dir-${cols.length}`)
    cols.push({ colFull: c, colStand: standCol, id, label })
    c += standCol != null ? 2 : 1
  }

  /** @type {number[]} */
  const session_counts = []
  /** @type {Record<string, { price_full: number | null, price_10: number | null }>} */
  const cells = {}
  /** @type {Record<string, number | null>} */
  const extras = {}

  for (let r = headerRow + 1; r < rows.length; r++) {
    const sessions = parseAzSessions(cell(rows, r, 1))
    if (sessions == null) continue
    // строка с ценами: хотя бы одна числовая в колонках направлений
    let anyPrice = false
    for (const col of cols) {
      if (parseAzMoney(cell(rows, r, col.colFull)) != null) {
        anyPrice = true
        break
      }
    }
    if (!anyPrice) continue

    if (!session_counts.includes(sessions)) session_counts.push(sessions)

    for (const col of cols) {
      const full = parseAzMoney(cell(rows, r, col.colFull))
      if (col.extraKey) {
        if (full != null && extras[col.extraKey] == null) extras[col.extraKey] = full
        continue
      }
      const stand = col.colStand != null ? parseAzMoney(cell(rows, r, col.colStand)) : null
      if (full == null && stand == null) continue
      cells[azPriceListCellKey(sessions, col.id)] = {
        price_full: full,
        price_10: stand,
      }
    }
  }

  const directions = cols
    .filter((col) => !col.extraKey)
    .map((col) => ({ id: col.id, label: col.label }))

  void kind
  return {
    directions,
    session_counts: session_counts.sort((a, b) => a - b),
    cells,
    extras,
  }
}

/**
 * Лист «Доплаты».
 * @param {unknown[][]} rows
 */
export function parseAzFeesSheet(rows) {
  let evening_pt_surcharge = null
  /** @type {Array<{ id: string, name: string, amount: number | null }>} */
  const other_fees = []

  for (let i = 0; i < rows.length; i++) {
    const name = cleanLabel(cell(rows, i, 0))
    const amount = parseAzMoney(cell(rows, i, 1))
    if (!name || amount == null) continue
    if (/вид\s+занятия|наименован|сумма/i.test(name)) continue
    if (/доплата\s+за\s+посещение|прочие\s+доплат|фитнес\s+клуб/i.test(name)) continue

    if (/персональн|вечерн/i.test(name)) {
      evening_pt_surcharge = amount
      continue
    }
    other_fees.push({
      id: `fee-${other_fees.length}`,
      name,
      amount,
    })
  }

  return { evening_pt_surcharge, other_fees }
}

/**
 * @param {{ resultRows?: unknown[][], classRows?: unknown[][], feeRows?: unknown[][], clubId?: string }} p
 */
export function importAzPriceListFromSheetRows(p) {
  const clubId = String(p.clubId ?? '').trim()
  const resultRows = Array.isArray(p.resultRows) ? p.resultRows : []
  const classRows = Array.isArray(p.classRows) ? p.classRows : []
  const feeRows = Array.isArray(p.feeRows) ? p.feeRows : []

  if (!resultRows.length && !classRows.length) {
    return { ok: false, error: 'Нет листов с сеткой АЗ', doc: emptyAzPriceListDocument({ club_id: clubId }) }
  }

  const headerSource = resultRows.length ? resultRows : classRows
  const meta = parseAzStandHeader(headerSource)

  const resultParsed = resultRows.length ? parseAzDirectionsSheet(resultRows, 'result') : null
  const classParsed = classRows.length ? parseAzDirectionsSheet(classRows, 'classes') : null
  const fees = feeRows.length ? parseAzFeesSheet(feeRows) : { evening_pt_surcharge: null, other_fees: [] }

  const session_counts = [
    ...new Set([...(resultParsed?.session_counts ?? []), ...(classParsed?.session_counts ?? [])]),
  ].sort((a, b) => a - b)

  const cells = {
    ...(resultParsed?.cells ?? {}),
    ...(classParsed?.cells ?? {}),
  }

  let valid_from = null
  for (const rows of [resultRows, classRows, feeRows]) {
    for (let i = 0; i < rows.length; i++) {
      const joined = (rows[i] ?? []).map((x) => String(x ?? '')).join(' ')
      if (/цены\s+действительн/i.test(joined)) {
        valid_from = parseAzValidFrom(joined)
        break
      }
    }
    if (valid_from) break
  }

  const extrasFromGrids = {
    ...(resultParsed?.extras ?? {}),
    ...(classParsed?.extras ?? {}),
  }

  const doc = normalizeAzPriceListDocument(
    {
      club_id: clubId,
      valid_from,
      meta,
      result_directions: resultParsed?.directions ?? [],
      class_directions: classParsed?.directions ?? [],
      session_counts,
      cells,
      extras: {
        result_plus: extrasFromGrids.result_plus ?? null,
        one_time_result_plus: extrasFromGrids.one_time_result_plus ?? null,
        evening_pt_surcharge: fees.evening_pt_surcharge,
        other_fees: fees.other_fees,
      },
    },
    clubId,
  )

  const stats = {
    result: doc.result_directions.length,
    classes: doc.class_directions.length,
    sessions: doc.session_counts.length,
    cells: Object.keys(doc.cells).length,
    fees: doc.extras.other_fees.length,
  }

  if (!stats.result && !stats.classes) {
    return { ok: false, error: 'Не удалось разобрать направления АЗ', doc, stats }
  }

  return { ok: true, doc, stats }
}
