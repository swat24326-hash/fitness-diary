/**
 * Импорт прайса ТЗ из Excel (эталон 1kfs_TZ_*.xls).
 */

import {
  normalizeTzPriceListDocument,
  parseTzMoney,
  parseTzMonths,
  parseTzSessions,
  parseTzValidFrom,
} from './tzPriceListCore.js'

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
 * Адрес / телефон из шапки (одна длинная ячейка).
 * @param {string} raw
 */
export function parseTzStandHeaderLine(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return { address: '', phone: '' }
  const phoneMatch = s.match(/(8[\d\-–—\s]{8,}|7[\d\-–—\s]{8,}|\+7[\d\-–—\s]{8,})/)
  const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, '-').replace(/–|—/g, '-').trim() : ''
  let address = s
  if (phoneMatch) address = s.slice(0, phoneMatch.index).trim().replace(/[,\s]+$/, '')
  return { address, phone }
}

/**
 * Лист «ТЗ 1мес.»
 * @param {unknown[][]} rows
 */
export function parseTzMonth1Sheet(rows) {
  const headerLine = String(cell(rows, 1, 0) || cell(rows, 1, 1) || '')
  const { address, phone } = parseTzStandHeaderLine(headerLine)

  let base_hours_note = ''
  let day_hours_note = ''
  const hoursRow = findRowIndex(rows, /9\.00|9:00|Посещение/)
  if (hoursRow >= 0) {
    base_hours_note = String(cell(rows, hoursRow, 3) || '').replace(/\s+/g, ' ').trim()
    day_hours_note = String(cell(rows, hoursRow, 6) || '').replace(/\s+/g, ' ').trim()
  }

  /** @type {object[]} */
  const month1_rows = []
  for (let i = 0; i < rows.length; i++) {
    const monthsRaw = cell(rows, i, 1)
    const sessionsRaw = cell(rows, i, 2)
    const baseFull = parseTzMoney(cell(rows, i, 3))
    if (baseFull == null) continue
    const months = parseTzMonths(monthsRaw) ?? (month1_rows.length ? 1 : parseTzMonths(monthsRaw))
    // Строки 10 занятий / без лимита — месяц в col1 пустой, берём 1
    const sessions = parseTzSessions(sessionsRaw)
    const looksLikePackage =
      /месяц|мес/i.test(String(monthsRaw)) ||
      /занят|лимит/i.test(String(sessionsRaw)) ||
      (sessions != null && sessions >= 4) ||
      /без\s*лимит/i.test(String(sessionsRaw).toLowerCase())
    if (!looksLikePackage) continue
    if (parseTzMoney(cell(rows, i, 4)) == null && parseTzMoney(cell(rows, i, 6)) == null) continue

    month1_rows.push({
      id: `m1-${month1_rows.length}`,
      months: months || 1,
      sessions,
      base_full: baseFull,
      base_stand: parseTzMoney(cell(rows, i, 4)),
      base_save: parseTzMoney(cell(rows, i, 5)),
      day_stand: parseTzMoney(cell(rows, i, 6)),
      day_save: parseTzMoney(cell(rows, i, 7)),
    })
  }

  let one_time = null
  let club_card = null
  let valid_from = null
  for (let i = 0; i < rows.length; i++) {
    const line = (rows[i] ?? []).map((x) => String(x ?? '')).join(' ').toLowerCase()
    if (/разовое/.test(line)) {
      one_time =
        parseTzMoney(cell(rows, i, 4)) ??
        parseTzMoney(cell(rows, i, 3)) ??
        parseTzMoney(cell(rows, i, 1))
    }
    if (/клубная\s*карта/.test(line)) {
      club_card =
        parseTzMoney(cell(rows, i, 4)) ??
        parseTzMoney(cell(rows, i, 3)) ??
        parseTzMoney(cell(rows, i, 1))
    }
    if (/действительны/.test(line)) {
      valid_from = parseTzValidFrom(line) || parseTzValidFrom(cell(rows, i, 5))
    }
  }

  return {
    address,
    phone,
    base_hours_note,
    day_hours_note,
    month1_rows,
    one_time,
    club_card,
    valid_from,
  }
}

/**
 * Лист «ТЗ акции»
 * @param {unknown[][]} rows
 */
export function parseTzPromoSheet(rows) {
  const headerLine = String(cell(rows, 1, 1) || cell(rows, 1, 0) || '')
  const { address, phone } = parseTzStandHeaderLine(headerLine)

  /** @type {object[]} */
  const promo_rows = []
  for (let i = 0; i < rows.length; i++) {
    const months = parseTzMonths(cell(rows, i, 1))
    if (!months) continue
    const sessionsRaw = cell(rows, i, 2)
    const base_full = parseTzMoney(cell(rows, i, 3))
    const promo = parseTzMoney(cell(rows, i, 4))
    if (base_full == null && promo == null) continue
    if (!/лимит|занят/i.test(String(sessionsRaw)) && !/без/i.test(String(sessionsRaw).toLowerCase())) {
      // всё равно акционные строки — без лимита
    }
    promo_rows.push({
      id: `promo-${months}`,
      months,
      sessions: parseTzSessions(sessionsRaw),
      base_full,
      promo,
      save: parseTzMoney(cell(rows, i, 5)),
      month_cost: parseTzMoney(cell(rows, i, 6)),
    })
  }

  let one_time = null
  let club_card = null
  let valid_from = null
  for (let i = 0; i < rows.length; i++) {
    const line = (rows[i] ?? []).map((x) => String(x ?? '')).join(' ').toLowerCase()
    if (/разовое/.test(line)) {
      one_time = parseTzMoney(cell(rows, i, 3)) ?? parseTzMoney(cell(rows, i, 1))
    }
    if (/клубная\s*карта/.test(line)) {
      club_card = parseTzMoney(cell(rows, i, 3)) ?? parseTzMoney(cell(rows, i, 1))
    }
    if (/действительны/.test(line)) {
      valid_from = parseTzValidFrom(line)
    }
  }

  return { address, phone, promo_rows, one_time, club_card, valid_from }
}

/**
 * @param {{
 *   month1Rows?: unknown[][],
 *   promoRows?: unknown[][],
 *   clubId?: string,
 * }} input
 */
export function importTzPriceListFromSheetRows(input) {
  const clubId = String(input.clubId ?? '').trim()
  const month1 = input.month1Rows?.length ? parseTzMonth1Sheet(input.month1Rows) : null
  const promo = input.promoRows?.length ? parseTzPromoSheet(input.promoRows) : null

  if (!month1 && !promo) {
    return { ok: false, error: 'В файле нет листов прайса ТЗ (1 мес. / акции)' }
  }

  const doc = normalizeTzPriceListDocument(
    {
      club_id: clubId,
      valid_from: month1?.valid_from || promo?.valid_from || null,
      meta: {
        address: month1?.address || promo?.address || '',
        phone: month1?.phone || promo?.phone || '',
        title: 'Тренажёрный зал',
        base_hours_note: month1?.base_hours_note || '',
        day_hours_note: month1?.day_hours_note || '',
      },
      month1_rows: month1?.month1_rows ?? [],
      promo_rows: promo?.promo_rows ?? [],
      extras: {
        one_time: month1?.one_time ?? promo?.one_time ?? 750,
        club_card: month1?.club_card ?? promo?.club_card ?? 500,
      },
    },
    clubId,
  )

  if (!doc.month1_rows.length && !doc.promo_rows.length) {
    return { ok: false, error: 'Не удалось разобрать строки прайса ТЗ' }
  }

  return {
    ok: true,
    doc,
    stats: {
      month1: doc.month1_rows.length,
      promo: doc.promo_rows.length,
    },
  }
}

/**
 * Найти имена листов 1мес / акции.
 * @param {string[]} sheetNames
 */
export function pickTzPriceSheetNames(sheetNames) {
  const names = (sheetNames ?? []).map((n) => String(n))
  const month1 =
    names.find((n) => /1\s*мес/i.test(n) && /тз/i.test(n)) ||
    names.find((n) => /1\s*мес/i.test(n)) ||
    null
  const promo =
    names.find((n) => /акци/i.test(n) && /тз/i.test(n)) ||
    names.find((n) => /акци/i.test(n)) ||
    null
  return { month1, promo }
}
