/**
 * Карточка клиента на плитке ежедневника: номер карты, тип абона, N/M и «до даты».
 * Имена (полное / короткое) — в trainerScheduleCore.js.
 */
import { formatDateRu } from '../dateRu.js'
import {
  membershipCoversDate,
  membershipHasTypeId,
  pickUsableTypedMembershipForDate,
} from '../membershipRules.js'
import {
  buildScheduleEntryLabel,
  normalizeScheduleClientIds,
  shortScheduleClientName,
} from './trainerScheduleCore.js'

/** @param {unknown} endDateIso @returns {string} «до ДД.ММ.ГГГГ» или '' */
export function scheduleMembershipEndsOnLabel(endDateIso) {
  const day = String(endDateIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  return `до ${formatDateRu(day)}`
}

/**
 * Абон для подписи на плитке: usable → кроющий дату → последний по сроку (чтобы «закончился» был виден).
 * @param {object[]|null|undefined} memberships
 * @param {string} dateIso
 */
export function pickMembershipForScheduleCardLabel(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return null
  const typed = (memberships ?? []).filter(membershipHasTypeId)
  const usable = pickUsableTypedMembershipForDate(typed, d)
  if (usable) return usable
  const covering =
    typed
      .filter((m) => membershipCoversDate(m, d))
      .sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0] ?? null
  if (covering) return covering
  return typed.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0] ?? null
}

/** Подпись «5/13» из полей абона; без лимита занятий — пусто. */
export function scheduleMembershipVisitsLabel(membership) {
  const total = Number(membership?.total_trainings ?? 0)
  if (!(total > 0)) return ''
  const used = Number(membership?.used_trainings ?? 0)
  return `${Number.isFinite(used) ? used : 0}/${total}`
}

/**
 * @param {{ cardNumber?: string, membershipLabel?: string, visitsLabel?: string, endsOnLabel?: string, membershipEnded?: boolean }} info
 * @returns {string} «№123 · Vip 2 · 5/13 · до 31.12.2026» или «… · закончился»
 */
export function formatScheduleClientCardMeta(info = {}) {
  const card = String(info.cardNumber ?? '').trim()
  const type = String(info.membershipLabel ?? '').trim()
  const visits = String(info.visitsLabel ?? '').trim()
  const endsOn = String(info.endsOnLabel ?? '').trim()
  const ended = Boolean(info.membershipEnded)
  const parts = []
  if (card) parts.push(`№${card}`)
  if (type) parts.push(type)
  if (visits) parts.push(visits)
  if (endsOn) parts.push(endsOn)
  if (ended && (type || visits || endsOn)) parts.push('закончился')
  return parts.join(' · ')
}

/**
 * @param {Map<string, object>|object[]|null|undefined} typesOrMap
 * @param {string|null|undefined} typeId
 */
function membershipTypeLabel(typesOrMap, typeId) {
  const id = String(typeId ?? '').trim()
  if (!id) return ''
  if (typesOrMap instanceof Map) {
    const t = typesOrMap.get(id)
    return String(t?.code ?? t?.name ?? '').trim()
  }
  const hit = (Array.isArray(typesOrMap) ? typesOrMap : []).find((t) => String(t?.id) === id)
  return String(hit?.code ?? hit?.name ?? '').trim()
}

/**
 * @param {Array<{ id?: string, name?: string, card_number?: string }>} clients
 * @param {Record<string, object[]>|Map<string, object[]>|null|undefined} membershipsByClientId
 * @param {Array<{ id?: string, code?: string, name?: string }>|Map<string, object>|null|undefined} membershipTypes
 * @param {string} asOfIso — дата, на которую смотрим абон
 * @returns {Record<string, { name: string, cardNumber: string, membershipLabel: string, visitsLabel: string, endsOnLabel: string, membershipEnded: boolean }>}
 */
export function buildScheduleClientInfoById(clients, membershipsByClientId, membershipTypes, asOfIso) {
  const day = String(asOfIso ?? '').slice(0, 10)
  /** @type {Record<string, { name: string, cardNumber: string, membershipLabel: string, visitsLabel: string, endsOnLabel: string, membershipEnded: boolean }>} */
  const out = {}
  for (const c of clients ?? []) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    const mems =
      membershipsByClientId instanceof Map
        ? membershipsByClientId.get(id) ?? []
        : membershipsByClientId?.[id] ?? []
    const active = day ? pickMembershipForScheduleCardLabel(mems, day) : null
    const covers = active && day ? membershipCoversDate(active, day) : false
    out[id] = {
      name: String(c?.name ?? '').trim() || 'Клиент',
      cardNumber: String(c?.card_number ?? '').trim(),
      membershipLabel: active ? membershipTypeLabel(membershipTypes, active.membership_type_id) : '',
      visitsLabel: active ? scheduleMembershipVisitsLabel(active) : '',
      endsOnLabel: active ? scheduleMembershipEndsOnLabel(active.end_date) : '',
      membershipEnded: Boolean(active && day && !covers),
    }
  }
  return out
}

/**
 * Строки плитки: имя (+ опционально мета карты). Заметка без клиентов — одна строка без меты.
 * @param {object} entry
 * @param {Record<string, string>} [clientNameById]
 * @param {Record<string, { name?: string, cardNumber?: string, membershipLabel?: string, visitsLabel?: string, endsOnLabel?: string, membershipEnded?: boolean }>} [clientInfoById]
 * @param {{ short?: boolean, withMeta?: boolean }} [opts]
 * @returns {Array<{ name: string, meta: string }>}
 */
export function buildScheduleEntryClientRows(
  entry,
  clientNameById = {},
  clientInfoById = {},
  { short = false, withMeta = false } = {},
) {
  const ids = normalizeScheduleClientIds(entry?.client_ids)
  /** @type {Array<{ name: string, meta: string }>} */
  const rows = []
  for (const id of ids) {
    const info = clientInfoById[id]
    const full = String(clientNameById[id] ?? info?.name ?? '').trim()
    if (!full) continue
    const name = short ? shortScheduleClientName(full) : full
    const meta = withMeta
      ? formatScheduleClientCardMeta({
          cardNumber: info?.cardNumber,
          membershipLabel: info?.membershipLabel,
          visitsLabel: info?.visitsLabel,
          endsOnLabel: info?.endsOnLabel,
          membershipEnded: info?.membershipEnded,
        })
      : ''
    rows.push({ name, meta })
  }
  if (!rows.length) {
    return [{ name: buildScheduleEntryLabel(entry, clientNameById), meta: '' }]
  }
  return rows
}
