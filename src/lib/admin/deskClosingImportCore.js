/**
 * Импорт списков закрывающихся договоров → план desk-карточек.
 * Чистая логика без React / IDB / xlsx.
 */

import {
  matchClientsByCardNumber,
  normalizeSalesCardNumber,
  looksLikeSalesCardNumber,
} from './salesClientMatchCore.js'
import { cellText, detectSalesHallFromLabel } from './salesPaymentsImportCore.js'

export const HOLDING_TRAINER_DISPLAY_NAME = 'Не назначен'

/**
 * @param {object|null|undefined} user
 */
export function isHoldingTrainerUser(user) {
  const name = String(user?.name ?? '').trim().toLowerCase()
  return name === HOLDING_TRAINER_DISPLAY_NAME.toLowerCase()
}

/**
 * @param {string} header
 * @returns {'card'|'name'|'phone'|'end'|'start'|'hall'|'type'|'external'|null}
 */
export function mapClosingHeader(header) {
  const h = cellText(header).toLowerCase()
  if (!h) return null
  if (/(карт|card)/.test(h) && !/тип/.test(h)) return 'card'
  if (/(фио|клиент|имя|name|фамилия)/.test(h)) return 'name'
  if (/(телефон|phone|тел\.?)/.test(h)) return 'phone'
  if (/(оконч|end|действует по|по\b|до\b|закрыт)/.test(h)) return 'end'
  if (/(начало|start|действует с|с\b)/.test(h) && !/оконч/.test(h)) return 'start'
  if (/(зал|направл|hall|пз|тз|аз)/.test(h)) return 'hall'
  if (/(тип|абонемент|тариф|пакет)/.test(h)) return 'type'
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
  const m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
  return null
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
  /** @type {Array<{ cardNumber: string, name: string, phone: string, endDate: string|null, startDate: string|null, hall: string|null, typeName: string, externalRef: string }>} */
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
    })
  }

  return { rows: out, reasons, headerMap }
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

  for (const row of input.parsedRows ?? []) {
    const match = matchClientsByCardNumber(input.clients, row.cardNumber)
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
      const mems = input.membershipsByClientId?.[cid] ?? []
      const hasCloseEnd =
        row.endDate &&
        mems.some((m) => String(m?.end_date ?? '').slice(0, 10) === row.endDate)
      if (hasCloseEnd) {
        skip += 1
        actions.push({
          ...row,
          action: 'skip',
          reason: 'Уже есть клиент и абонемент с этой датой окончания',
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
    create += 1
    actions.push({
      ...row,
      action: 'create',
      reason: 'Новая desk-карточка + membership с end_date',
      clientId: null,
    })
  }

  return { actions, counts: { create, skip, conflict, total: actions.length } }
}
