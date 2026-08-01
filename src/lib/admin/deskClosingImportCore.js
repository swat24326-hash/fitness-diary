/**
 * Импорт списков закрывающихся договоров → план desk-карточек.
 * Чистая логика без React / IDB / xlsx.
 */

import {
  matchClientByCardThenPhone,
  normalizeSalesCardNumber,
  looksLikeSalesCardNumber,
} from './salesClientMatchCore.js'
import { cellText, detectSalesHallFromLabel } from './salesPaymentsImportCore.js'
import { normalizeDeskHall } from './deskHallClientsCore.js'

export const HOLDING_TRAINER_DISPLAY_NAME = 'Не назначен'

/**
 * @param {object|null|undefined} user
 */
export function isHoldingTrainerUser(user) {
  if (user?.is_system_placeholder === true) return true
  const name = String(user?.name ?? '').trim().toLowerCase()
  return name === HOLDING_TRAINER_DISPLAY_NAME.toLowerCase()
}

/**
 * @param {string} header
 * @returns {'card'|'name'|'phone'|'end'|'start'|'hall'|'type'|'external'|'price'|null}
 */
export function mapClosingHeader(header) {
  const h = cellText(header).toLowerCase()
  if (!h) return null
  // 1С: «Клиент» = код/№ карты, «Физическое лицо» = ФИО
  if (h === 'клиент' || h === 'код клиента' || h === '№ клиента') return 'card'
  if (/(физическ|фио|фамилия)/.test(h) || (/(имя|name)/.test(h) && !/абонемент/.test(h))) return 'name'
  if (/(телефон|phone|тел\.?)/.test(h)) return 'phone'
  if (/(цен[аые]|стоимость|сумма|оплат|price|paid|₽|руб)/.test(h) && !/тип/.test(h)) return 'price'
  if (/(оконч|факт\s*оконч|end|действует по|закрыт)/.test(h)) return 'end'
  if (/(начало|start|действует с)/.test(h) && !/оконч/.test(h)) return 'start'
  // 1С: «Абонемент.Тип карты» = ТЗ / АЗ / ТЗ Утро → зал
  if (/тип\s*карт/.test(h)) return 'hall'
  if (/(зал|направл|hall)/.test(h) || (/(^|\b)(пз|тз|аз)(\b|$)/.test(h) && !/тип|карт|сотруд/.test(h))) {
    return 'hall'
  }
  if (/(карт|card)/.test(h) && !/тип/.test(h)) return 'card'
  // «Абонемент.Сотрудник» — не тип абона
  if (/сотрудник|тренер/.test(h)) return null
  if (/(тип|тариф|пакет)/.test(h) && !/карт/.test(h)) return 'type'
  if (/(1с|external|договор|номер дог)/.test(h)) return 'external'
  return null
}

/**
 * @param {unknown} raw
 * @returns {string|null} YYYY-MM-DD
 */
export function parseClosingDateCell(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, '0')
    const d = String(raw.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial (примерно)
    const epoch = Date.UTC(1899, 11, 30)
    const ms = epoch + Math.round(raw) * 86400000
    const dt = new Date(ms)
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10)
    }
  }
  const t = cellText(raw)
  // 1С: «31.08.2026 23:59:59»
  const m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s|$)/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
  return null
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseClosingPriceCell(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw * 100) / 100
  }
  let t = cellText(raw).replace(/\s/g, '').replace(/₽|руб\.?/gi, '')
  if (!t) return null
  // 2,000.00 (US) или 2.000,00 (EU)
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '')
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(',', '.')
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/**
 * @param {unknown[][]} rows
 */
export function parseClosingAgreementsAoA(rows) {
  const list = rows ?? []
  if (list.length < 2) {
    return { rows: [], reasons: ['Пустой файл'], headerMap: {} }
  }

  let headerIdx = 0
  /** @type {Record<string, number>} */
  let headerMap = {}
  for (let i = 0; i < Math.min(list.length, 15); i++) {
    const map = {}
    ;(list[i] ?? []).forEach((cell, col) => {
      const key = mapClosingHeader(cell)
      if (key != null && map[key] == null) map[key] = col
    })
    if (map.card != null && (map.name != null || map.end != null)) {
      headerIdx = i
      headerMap = map
      break
    }
  }

  if (headerMap.card == null) {
    return {
      rows: [],
      reasons: ['Не найдены колонки «карта» (+ ФИО или дата окончания). Подпишите заголовки.'],
      headerMap: {},
    }
  }

  const reasons = []
  /** @type {Array<{ cardNumber: string, name: string, phone: string, endDate: string|null, startDate: string|null, hall: string|null, typeName: string, externalRef: string, paidAmount: number|null }>} */
  const out = []

  for (let r = headerIdx + 1; r < list.length; r++) {
    const row = list[r] ?? []
    const cardRaw = row[headerMap.card]
    const cardNumber = normalizeSalesCardNumber(cardRaw)
    if (!cardNumber) continue
    if (!looksLikeSalesCardNumber(cardRaw) && !/^\d+$/.test(cardNumber)) {
      continue
    }
    const name = headerMap.name != null ? cellText(row[headerMap.name]) : ''
    const phone = headerMap.phone != null ? cellText(row[headerMap.phone]) : ''
    const endDate = headerMap.end != null ? parseClosingDateCell(row[headerMap.end]) : null
    const startDate = headerMap.start != null ? parseClosingDateCell(row[headerMap.start]) : null
    let hall = null
    if (headerMap.hall != null) hall = detectSalesHallFromLabel(row[headerMap.hall])
    const typeName = headerMap.type != null ? cellText(row[headerMap.type]) : ''
    const externalRef = headerMap.external != null ? cellText(row[headerMap.external]) : ''
    const paidAmount = headerMap.price != null ? parseClosingPriceCell(row[headerMap.price]) : null

    if (!endDate) {
      reasons.push(`Карта ${cardNumber}: нет даты окончания — строка в превью, create без end рискован`)
    }
    out.push({
      cardNumber,
      name: name || `Клиент ${cardNumber}`,
      phone,
      endDate,
      startDate,
      hall,
      typeName,
      externalRef,
      paidAmount,
    })
  }

  return { rows: out, reasons, headerMap }
}

/**
 * Привязать строки закрытий к карте зала (ТЗ / АЗ).
 * Если в файле нет колонки зала — весь список считается этим залом.
 * Если зал есть — оставляем совпадения (+ пустой зал помечаем как target).
 *
 * @param {ReturnType<typeof parseClosingAgreementsAoA>['rows']} rows
 * @param {'tz'|'az'|null|undefined} hallCode
 */
export function scopeClosingRowsToHall(rows, hallCode) {
  const hall = hallCode === 'tz' || hallCode === 'az' ? hallCode : null
  const list = Array.isArray(rows) ? rows : []
  if (!hall) return list
  const hasAnyHall = list.some((r) => r?.hall === 'tz' || r?.hall === 'az' || r?.hall === 'pz')
  if (!hasAnyHall) {
    return list.map((r) => ({ ...r, hall }))
  }
  return list
    .filter((r) => !r.hall || r.hall === hall)
    .map((r) => ({ ...r, hall: r.hall || hall }))
}

/**
 * @param {{
 *   parsedRows: ReturnType<typeof parseClosingAgreementsAoA>['rows'],
 *   clients: object[],
 *   membershipsByClientId?: Record<string, object[]>,
 * }} input
 */
export function planDeskClosingImport(input) {
  /** @type {Array<object>} */
  const actions = []
  let create = 0
  let skip = 0
  let conflict = 0
  let tagHall = 0

  for (const row of input.parsedRows ?? []) {
    const match = matchClientByCardThenPhone({
      clients: input.clients,
      cardNumber: row.cardNumber,
      phone: row.phone,
      preferOperational: true,
      deskImportResolve: true,
    })
    if (match.status === 'conflict') {
      conflict += 1
      actions.push({
        ...row,
        action: 'conflict',
        reason: match.reason,
        clientId: null,
      })
      continue
    }
    if (match.status === 'one') {
      const cid = String(match.client.id)
      const rowHall = row.hall === 'tz' || row.hall === 'az' ? row.hall : null
      const curHall = normalizeDeskHall(match.client?.desk_hall)
      if (rowHall && curHall !== rowHall) {
        tagHall += 1
        actions.push({
          ...row,
          hall: rowHall,
          action: 'tag_hall',
          reason: curHall
            ? `Сменить desk-зал ${curHall.toUpperCase()} → ${rowHall.toUpperCase()}`
            : `Проставить desk-зал ${rowHall.toUpperCase()} (вкладка ${rowHall.toUpperCase()})`,
          clientId: cid,
        })
      }
      const mems = input.membershipsByClientId?.[cid] ?? []
      const hasCloseEnd =
        row.endDate &&
        mems.some((m) => String(m?.end_date ?? '').slice(0, 10) === row.endDate)
      if (hasCloseEnd) {
        skip += 1
        actions.push({
          ...row,
          action: 'skip',
          reason: `Уже есть клиент и абонемент с этой датой окончания (${match.matchedBy === 'phone' ? 'телефон' : 'карта'})`,
          clientId: cid,
        })
      } else {
        skip += 1
        actions.push({
          ...row,
          action: 'skip',
          reason: 'Клиент уже есть — живой абон не затираем (назначьте/добавьте абон вручную при необходимости)',
          clientId: cid,
        })
      }
      continue
    }
    if (!row.endDate) {
      skip += 1
      actions.push({
        ...row,
        action: 'skip',
        reason: 'Нет end_date — не создаём desk без даты',
        clientId: null,
      })
      continue
    }
    const createHall = row.hall === 'tz' || row.hall === 'az' ? row.hall : null
    if (!createHall) {
      skip += 1
      actions.push({
        ...row,
        action: 'skip',
        reason:
          'Нет зала ТЗ/АЗ в строке (тип карты) — некуда положить карточку; проверьте колонку «Абонемент.Тип карты»',
        clientId: null,
      })
      continue
    }
    create += 1
    actions.push({
      ...row,
      hall: createHall,
      action: 'create',
      reason: `Новая desk-карточка ${createHall.toUpperCase()} + membership с end_date`,
      clientId: null,
    })
  }

  let hallTz = 0
  let hallAz = 0
  let hallUnknown = 0
  for (const row of input.parsedRows ?? []) {
    if (row?.hall === 'tz') hallTz += 1
    else if (row?.hall === 'az') hallAz += 1
    else hallUnknown += 1
  }

  return {
    actions,
    counts: {
      create,
      skip,
      conflict,
      tagHall,
      total: actions.length,
      hallTz,
      hallAz,
      hallUnknown,
    },
  }
}
