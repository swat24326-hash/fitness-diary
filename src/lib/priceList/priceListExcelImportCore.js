/**
 * Импорт прайса из Excel (чистая логика по AOA-строкам, без xlsx/React).
 * Эталон колонок — membership_types; Excel-подписи только для сопоставления.
 */

import {
  emptyPriceListDocument,
  filterPriceListCatalogTypes,
  matchMembershipTypeByExcelLabel,
  normalizeMatchKey,
  normalizePriceListDocument,
  normalizePriceListMode,
  roundMoneyRub,
  setPriceListCell,
} from './priceListCore.js'

/** @param {unknown} v */
function cellStr(v) {
  if (v == null) return ''
  return String(v).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
}

/** @param {unknown} v */
function parseMoney(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return roundMoneyRub(v)
  const s = String(v).replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? roundMoneyRub(n) : null
}

/** @param {unknown} v */
function parsePositiveInt(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

/**
 * @param {string} sheetName
 * @returns {'base' | 'day' | 'vip' | 'unknown'}
 */
export function detectPriceListSheetKind(sheetName) {
  const k = normalizeMatchKey(sheetName)
  if (!k) return 'unknown'
  if (k.includes('vip') || k.includes('вип')) return 'vip'
  if (k.includes('дневн') || k.includes('день') || k.includes('day')) return 'day'
  if (k.includes('базов') || k.includes('пз')) return 'base'
  return 'unknown'
}

/**
 * @param {string} label
 */
export function isExcelDiffColumnLabel(label) {
  const k = normalizeMatchKey(label)
  return k.includes('разниц')
}

/**
 * @param {string} label
 */
export function isExcelDiscount10ColumnLabel(label) {
  const raw = String(label ?? '')
  // Важно: до normalizeMatchKey — он вырезает «- 10%» и ломает детект.
  if (/10\s*%/i.test(raw)) return true
  const k = normalizeMatchKey(label)
  return k.includes('скидка 10')
}

/**
 * Убрать хвост «−10%» / «скидка» для имени карты.
 * @param {string} label
 */
export function stripExcelDiscountSuffix(label) {
  return cellStr(label)
    .replace(/\s*[-–—]?\s*10\s*%\s*$/i, '')
    .replace(/\s*скидка\s*10\s*%\s*$/i, '')
    .trim()
}

/**
 * Найти строку заголовка матрицы (тренировки + человек).
 * @param {unknown[][]} rows
 * @returns {number} index or -1
 */
export function findPriceListHeaderRowIndex(rows) {
  const list = Array.isArray(rows) ? rows : []
  for (let i = 0; i < list.length; i++) {
    const joined = (list[i] ?? []).map(cellStr).join(' | ').toLowerCase()
    const hasSessions = joined.includes('трениров') || joined.includes('кол-во тренировок')
    const hasPeople = joined.includes('человек') || joined.includes('кол-во человек')
    if (hasSessions && hasPeople) return i
  }
  return -1
}

/**
 * Индексы колонок sessions/people в строке заголовка.
 * @param {unknown[]} headerRow
 */
export function findSessionsPeopleColumns(headerRow) {
  const row = Array.isArray(headerRow) ? headerRow : []
  let sessionsCol = -1
  let peopleCol = -1
  row.forEach((cell, idx) => {
    const k = normalizeMatchKey(cell)
    if (sessionsCol < 0 && (k.includes('трениров') || k.includes('кол-во тренировок'))) sessionsCol = idx
    if (peopleCol < 0 && (k.includes('человек') || k.includes('кол-во человек'))) peopleCol = idx
  })
  if (sessionsCol < 0) sessionsCol = 0
  if (peopleCol < 0) peopleCol = sessionsCol + 1
  return { sessionsCol, peopleCol }
}

/**
 * Пары колонок full/−10% по строке заголовка (лист ПЗ).
 * @param {unknown[]} headerRow
 * @param {number} startCol
 * @returns {Array<{ excelLabel: string, fullCol: number, discountCol: number | null }>}
 */
export function detectExcelTariffColumnPairs(headerRow, startCol = 2) {
  const row = Array.isArray(headerRow) ? headerRow : []
  /** @type {Array<{ excelLabel: string, fullCol: number, discountCol: number | null }>} */
  const pairs = []
  let i = Math.max(0, startCol)
  while (i < row.length) {
    const label = cellStr(row[i])
    if (!label || isExcelDiffColumnLabel(label)) {
      i += 1
      continue
    }
    if (isExcelDiscount10ColumnLabel(label)) {
      // «−10%» без предшествующей полной — пропускаем
      i += 1
      continue
    }
    const excelLabel = stripExcelDiscountSuffix(label)
    const fullCol = i
    let discountCol = null
    const next = cellStr(row[i + 1])
    if (next && isExcelDiscount10ColumnLabel(next)) {
      discountCol = i + 1
      i += 2
    } else {
      i += 1
    }
    // пропуск «разница» после пары
    if (isExcelDiffColumnLabel(cellStr(row[i]))) i += 1
    if (excelLabel) pairs.push({ excelLabel, fullCol, discountCol })
  }
  return pairs
}

/**
 * Meta: адрес/телефон из первой строки, дата «с …».
 * @param {unknown[][]} rows
 */
export function extractPriceListExcelMeta(rows) {
  const list = Array.isArray(rows) ? rows : []
  let address = ''
  let phone = ''
  let valid_from = null
  let title = 'Персональный зал'

  const first = cellStr(list[0]?.[0])
  if (first) {
    const phoneMatch = first.match(/(\d[\d\-\s]{8,}\d)/)
    if (phoneMatch) {
      phone = phoneMatch[1].replace(/\s+/g, '').trim()
      address = first.replace(phoneMatch[0], '').replace(/\s+/g, ' ').trim()
    } else {
      address = first
    }
  }

  for (const row of list) {
    for (const cell of row ?? []) {
      const s = cellStr(cell)
      if (/персональный\s+зал/i.test(s)) title = 'Персональный зал'
      const m = s.match(/цены\s+действительны\s+с\s+(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i)
      if (m) {
        const dd = m[1].padStart(2, '0')
        const mm = m[2].padStart(2, '0')
        let yyyy = m[3]
        if (yyyy.length === 2) yyyy = `20${yyyy}`
        valid_from = `${yyyy}-${mm}-${dd}`
      }
      const club = s.match(/клубная\s+карта/i)
      if (club) {
        /* handled in extras parse */
      }
    }
  }

  return { address, phone, title, valid_from }
}

/**
 * @param {unknown[][]} rows
 */
export function extractExcelClubCard(rows) {
  const list = Array.isArray(rows) ? rows : []
  for (const row of list) {
    const cells = row ?? []
    for (let i = 0; i < cells.length; i++) {
      if (/клубная\s+карта/i.test(cellStr(cells[i]))) {
        for (let j = i + 1; j < Math.min(i + 6, cells.length); j++) {
          const money = parseMoney(cells[j])
          if (money != null) return money
        }
      }
    }
  }
  return null
}

/**
 * Разбор листа ПЗ (база или день): матрица sessions×people×карты.
 * @param {unknown[][]} rows
 * @param {'base' | 'day'} mode
 */
export function parsePzMatrixSheet(rows, mode) {
  const headerIdx = findPriceListHeaderRowIndex(rows)
  if (headerIdx < 0) {
    return { ok: false, error: 'Не найдена строка «тренировки / человек»', mode, columns: [], cells: [] }
  }
  const headerRow = rows[headerIdx] ?? []
  const { sessionsCol, peopleCol } = findSessionsPeopleColumns(headerRow)
  const startCol = Math.max(sessionsCol, peopleCol) + 1
  const columns = detectExcelTariffColumnPairs(headerRow, startCol)
  /** @type {Array<{ sessions: number, people: number, excelLabel: string, mode: string, price_full: number | null, price_10: number | null }>} */
  const cells = []
  let lastSessions = null
  let lastPeople = null

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const firstText = cellStr(row[sessionsCol] || row[0])
    if (/разовое|цены\s+действительны|клубная/i.test(firstText)) break

    const sessionsRaw = parsePositiveInt(row[sessionsCol])
    const peopleRaw = parsePositiveInt(row[peopleCol])
    if (sessionsRaw != null) lastSessions = sessionsRaw
    if (peopleRaw != null) lastPeople = peopleRaw
    if (lastSessions == null || lastPeople == null) continue
    if (sessionsRaw == null && peopleRaw == null && !columns.some((c) => parseMoney(row[c.fullCol]) != null)) {
      continue
    }

    for (const col of columns) {
      const price_full = parseMoney(row[col.fullCol])
      const price_10 = col.discountCol != null ? parseMoney(row[col.discountCol]) : null
      if (price_full == null && price_10 == null) continue
      cells.push({
        sessions: lastSessions,
        people: lastPeople,
        excelLabel: col.excelLabel,
        mode: normalizePriceListMode(mode),
        price_full,
        price_10,
      })
    }
  }

  return {
    ok: true,
    mode: normalizePriceListMode(mode),
    columns: columns.map((c) => c.excelLabel),
    cells,
    meta: extractPriceListExcelMeta(rows),
    club_card: extractExcelClubCard(rows),
  }
}

/**
 * VIP-лист: одна карта, base + day в соседних парах колонок, часто только people=1.
 * @param {unknown[][]} rows
 * @param {string} sheetName
 */
export function parseVipSheet(rows, sheetName) {
  const headerIdx = findPriceListHeaderRowIndex(rows)
  if (headerIdx < 0) {
    return { ok: false, error: `VIP «${sheetName}»: нет заголовка`, mode: 'vip', columns: [], cells: [] }
  }
  const headerRow = rows[headerIdx] ?? []
  const { sessionsCol, peopleCol } = findSessionsPeopleColumns(headerRow)

  /** Ищем подписи вип / вип день в строке header или следующей */
  const labelRow = headerRow
  const subRow = rows[headerIdx + 1] ?? []

  /** @type {Array<{ excelLabel: string, mode: 'base' | 'day', fullCol: number, discountCol: number | null }>} */
  const bands = []
  for (let i = peopleCol + 1; i < labelRow.length; i++) {
    const label = cellStr(labelRow[i])
    if (!label || /клубная/i.test(label)) continue
    if (/базов|скидка/i.test(label) && !/вип|vip/i.test(label)) continue
    const k = normalizeMatchKey(label)
    if (!k) continue
    const isDay = k.includes('день') || k.includes('day')
    const excelLabel = stripExcelDiscountSuffix(label).replace(/\s*день\s*$/i, '').trim() || sheetName
    // Подзаголовок: текущая и следующая колонка = full / 10%
    let fullCol = i
    let discountCol = i + 1
    // Если в subRow явно «Базовая / Скидка» на i / i+1
    const sub0 = normalizeMatchKey(subRow[i])
    const sub1 = normalizeMatchKey(subRow[i + 1])
    if (sub0.includes('базов') || sub1.includes('скид') || sub1.includes('10')) {
      fullCol = i
      discountCol = i + 1
      bands.push({
        excelLabel: excelLabel || sheetName,
        mode: isDay ? 'day' : 'base',
        fullCol,
        discountCol,
      })
      i += 1
      continue
    }
    // Иначе пара значений без подписи скидки на том же уровне
    bands.push({
      excelLabel: excelLabel || sheetName,
      mode: isDay ? 'day' : 'base',
      fullCol: i,
      discountCol: i + 1,
    })
    i += 1
  }

  // Если bands пусты — fallback: первые 4 колонки после people
  if (!bands.length) {
    const start = peopleCol + 1
    bands.push(
      { excelLabel: sheetName, mode: 'base', fullCol: start, discountCol: start + 1 },
      { excelLabel: sheetName, mode: 'day', fullCol: start + 2, discountCol: start + 3 },
    )
  }

  const columns = [...new Set(bands.map((b) => b.excelLabel))]
  /** @type {Array<{ sessions: number, people: number, excelLabel: string, mode: string, price_full: number | null, price_10: number | null }>} */
  const cells = []
  let lastSessions = null
  let lastPeople = 1
  const dataStart = headerIdx + 1
  // пропуск строки подзаголовков
  const firstData = normalizeMatchKey(rows[dataStart]?.[sessionsCol] ?? rows[dataStart]?.[peopleCol])
  const skipSub = !parsePositiveInt(rows[dataStart]?.[sessionsCol]) && !parsePositiveInt(rows[dataStart]?.[peopleCol])
    && (/базов|скид/.test(firstData) || !cellStr(rows[dataStart]?.[sessionsCol]))

  for (let r = dataStart + (skipSub ? 1 : 0); r < rows.length; r++) {
    const row = rows[r] ?? []
    const marker = cellStr(row[sessionsCol] || row[peopleCol] || row[0])
    if (/разовое|цены\s+действительны/i.test(marker)) break

    const sessionsRaw = parsePositiveInt(row[sessionsCol])
    const peopleRaw = parsePositiveInt(row[peopleCol])
    if (sessionsRaw != null) lastSessions = sessionsRaw
    if (peopleRaw != null) lastPeople = peopleRaw
    if (lastSessions == null) continue

    for (const band of bands) {
      const price_full = parseMoney(row[band.fullCol])
      const price_10 = band.discountCol != null ? parseMoney(row[band.discountCol]) : null
      if (price_full == null && price_10 == null) continue
      cells.push({
        sessions: lastSessions,
        people: lastPeople,
        excelLabel: band.excelLabel,
        mode: band.mode,
        price_full,
        price_10,
      })
    }
  }

  return {
    ok: true,
    mode: 'vip',
    columns,
    cells,
    meta: extractPriceListExcelMeta(rows),
    club_card: extractExcelClubCard(rows),
  }
}

/**
 * Разобрать все листы рабочей книги (уже как name → rows).
 * @param {Array<{ name: string, rows: unknown[][] }>} sheets
 */
export function parsePriceListWorkbookSheets(sheets) {
  const list = Array.isArray(sheets) ? sheets : []
  /** @type {Array<object>} */
  const parsedSheets = []
  /** @type {string[]} */
  const allLabels = []
  let meta = { address: '', phone: '', title: 'Персональный зал', valid_from: null }
  let club_card = null

  for (const sheet of list) {
    const name = String(sheet?.name ?? '')
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : []
    const kind = detectPriceListSheetKind(name)
    let parsed
    if (kind === 'vip') parsed = parseVipSheet(rows, name)
    else if (kind === 'day') parsed = parsePzMatrixSheet(rows, 'day')
    else if (kind === 'base') parsed = parsePzMatrixSheet(rows, 'base')
    else {
      // неизвестный — пробуем как base matrix
      parsed = parsePzMatrixSheet(rows, 'base')
      if (!parsed.ok) parsed = parseVipSheet(rows, name)
    }
    parsedSheets.push({ name, kind, ...parsed })
    if (parsed.ok) {
      for (const label of parsed.columns ?? []) {
        if (label && !allLabels.includes(label)) allLabels.push(label)
      }
      if (parsed.meta?.address && !meta.address) meta = { ...meta, ...parsed.meta }
      else if (parsed.meta?.valid_from && !meta.valid_from) meta = { ...meta, valid_from: parsed.meta.valid_from }
      if (parsed.club_card != null && club_card == null) club_card = parsed.club_card
    }
  }

  return {
    ok: parsedSheets.some((s) => s.ok),
    sheets: parsedSheets,
    excelLabels: allLabels,
    meta,
    club_card,
  }
}

/**
 * Предложить mapping excelLabel → membership_type_id.
 * @param {string[]} excelLabels
 * @param {object[]} membershipTypes
 */
export function suggestExcelColumnMapping(excelLabels, membershipTypes) {
  const catalog = filterPriceListCatalogTypes(membershipTypes)
  /** @type {Record<string, string | null>} */
  const mapping = {}
  for (const label of excelLabels ?? []) {
    const hit = matchMembershipTypeByExcelLabel(label, catalog)
    mapping[label] = hit?.id ?? null
  }
  return mapping
}

/**
 * Применить импорт к документу прайса.
 * @param {object} doc
 * @param {ReturnType<typeof parsePriceListWorkbookSheets>} workbook
 * @param {Record<string, string | null | undefined>} columnMapping excelLabel → membership_type_id
 * @param {object[]} membershipTypes
 * @param {{ replaceCells?: boolean }} [opts]
 */
export function applyExcelImportToPriceListDocument(doc, workbook, columnMapping, membershipTypes, opts = {}) {
  const replaceCells = opts.replaceCells !== false
  const clubId = String(doc?.club_id ?? '').trim()
  let next = normalizePriceListDocument(
    {
      ...(doc && typeof doc === 'object' ? doc : emptyPriceListDocument({ club_id: clubId })),
      cells: replaceCells ? {} : { ...(doc?.cells ?? {}) },
    },
    clubId,
  )

  const catalog = filterPriceListCatalogTypes(membershipTypes)
  const byId = new Map(catalog.map((t) => [String(t.id), t]))

  /** @type {Map<string, { membership_type_id: string, code: string, print_label: string, sort_order: number, is_vip: boolean }>} */
  const tariffMap = new Map()
  ;(next.tariffs ?? []).forEach((t) => tariffMap.set(String(t.membership_type_id), t))

  const peopleSet = new Set(next.people?.length ? next.people : [1])
  const sessionsSet = new Set(next.sessions?.length ? next.sessions : [4, 8, 10])

  let applied = 0
  let skippedUnmapped = 0

  for (const sheet of workbook.sheets ?? []) {
    if (!sheet.ok) continue
    for (const cell of sheet.cells ?? []) {
      const typeId = columnMapping?.[cell.excelLabel]
      if (!typeId || !byId.has(String(typeId))) {
        skippedUnmapped += 1
        continue
      }
      const t = byId.get(String(typeId))
      const code = String(t.code ?? '').trim()
      const codeKey = normalizeMatchKey(code)
      if (!tariffMap.has(String(typeId))) {
        tariffMap.set(String(typeId), {
          membership_type_id: String(typeId),
          code,
          print_label: code,
          sort_order: tariffMap.size,
          is_vip: codeKey.startsWith('vip') || codeKey.startsWith('вип'),
        })
      }
      peopleSet.add(cell.people)
      sessionsSet.add(cell.sessions)
      next = setPriceListCell(next, {
        sessions: cell.sessions,
        people: cell.people,
        membershipTypeId: String(typeId),
        mode: cell.mode,
        price_full: cell.price_full,
        price_10: cell.price_10,
        linkDiscount: false,
      })
      applied += 1
    }
  }

  const metaIn = workbook.meta ?? {}
  next = {
    ...next,
    tariffs: [...tariffMap.values()].sort((a, b) => a.sort_order - b.sort_order),
    people: [...peopleSet].filter((n) => n >= 1 && n <= 5).sort((a, b) => a - b),
    sessions: [...sessionsSet].filter((n) => n > 0).sort((a, b) => a - b),
    valid_from: metaIn.valid_from || next.valid_from,
    meta: {
      ...next.meta,
      address: metaIn.address || next.meta?.address || '',
      phone: metaIn.phone || next.meta?.phone || '',
      title: metaIn.title || next.meta?.title || 'Персональный зал',
    },
    extras: {
      ...next.extras,
      club_card: workbook.club_card ?? next.extras?.club_card ?? 500,
    },
  }

  return {
    doc: normalizePriceListDocument(next, clubId),
    applied,
    skippedUnmapped,
    unmappedLabels: (workbook.excelLabels ?? []).filter((l) => !columnMapping?.[l]),
  }
}
