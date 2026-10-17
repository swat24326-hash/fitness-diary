/**
 * Карточка клиента на плитке ежедневника: номер карты и тип абонемента.
 * Имена (полное / короткое) — в trainerScheduleCore.js.
 */
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

/**
 * Абон для подписи на плитке: сначала usable с остатком, иначе любой кроющий дату с типом
 * (календарный ТЗ с total_trainings = 0 тоже показывается).
 * @param {object[]|null|undefined} memberships
 * @param {string} dateIso
 */
export function pickMembershipForScheduleCardLabel(memberships, dateIso) {
  const d = String(dateIso ?? '').slice(0, 10)
  if (!d) return null
  const typed = (memberships ?? []).filter(membershipHasTypeId)
  const usable = pickUsableTypedMembershipForDate(typed, d)
  if (usable) return usable
  return (
    typed
      .filter((m) => membershipCoversDate(m, d))
      .sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0] ?? null
  )
}

/**
 * @param {{ cardNumber?: string, membershipLabel?: string }} info
 * @returns {string} «№123 · ТЗ» или часть, если чего-то нет
 */
export function formatScheduleClientCardMeta(info = {}) {
  const card = String(info.cardNumber ?? '').trim()
  const type = String(info.membershipLabel ?? '').trim()
  const parts = []
  if (card) parts.push(`№${card}`)
  if (type) parts.push(type)
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
 * @param {string} asOfIso — дата, на которую берём действующий абон
 * @returns {Record<string, { name: string, cardNumber: string, membershipLabel: string }>}
 */
export function buildScheduleClientInfoById(clients, membershipsByClientId, membershipTypes, asOfIso) {
  const day = String(asOfIso ?? '').slice(0, 10)
  /** @type {Record<string, { name: string, cardNumber: string, membershipLabel: string }>} */
  const out = {}
  for (const c of clients ?? []) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    const mems =
      membershipsByClientId instanceof Map
        ? membershipsByClientId.get(id) ?? []
        : membershipsByClientId?.[id] ?? []
    const active = day ? pickMembershipForScheduleCardLabel(mems, day) : null
    out[id] = {
      name: String(c?.name ?? '').trim() || 'Клиент',
      cardNumber: String(c?.card_number ?? '').trim(),
      membershipLabel: active ? membershipTypeLabel(membershipTypes, active.membership_type_id) : '',
    }
  }
  return out
}

/**
 * Строки плитки: имя (+ опционально мета карты). Заметка без клиентов — одна строка без меты.
 * @param {object} entry
 * @param {Record<string, string>} [clientNameById]
 * @param {Record<string, { name?: string, cardNumber?: string, membershipLabel?: string }>} [clientInfoById]
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
        })
      : ''
    rows.push({ name, meta })
  }
  if (!rows.length) {
    return [{ name: buildScheduleEntryLabel(entry, clientNameById), meta: '' }]
  }
  return rows
}
