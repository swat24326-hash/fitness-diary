/**
 * Фильтр статистики клуба по залу ПЗ / ТЗ / АЗ.
 * Без React / IDB. Канон: memberships.hall + clients.desk_hall (CLIENT_MULTI_HALL).
 *
 * Важно: для ПЗ в census нужен реальный абон hall=pz (или legacy без абонов).
 * Не считаем «есть trainer_id» за ПЗ, если у человека только абоны ТЗ/АЗ —
 * иначе раздувается «Всего» и «Не активные» на вкладке ПЗ.
 */

import { isClientArchived } from '../clientArchive.js'
import {
  membershipHallOf,
  normalizeMembershipHall,
} from '../membershipHallCore.js'
import { normalizeDeskHall } from './deskHallClientsCore.js'
import { isClientOnHoldingTrainer } from './holdingClientsCore.js'

/** @typedef {'pz'|'tz'|'az'} ClubStatsHall */

export const CLUB_STATS_HALLS = /** @type {const} */ (['pz', 'tz', 'az'])

export const CLUB_STATS_HALL_LABELS = {
  pz: 'ПЗ',
  tz: 'ТЗ',
  az: 'АЗ',
}

/**
 * @param {unknown} raw
 * @returns {ClubStatsHall|null} null = без фильтра по залу (legacy census)
 */
export function normalizeClubStatsHall(raw) {
  return normalizeMembershipHall(raw)
}

/**
 * Карточки только для персонального зала.
 * @param {unknown} hall
 */
export function clubStatsHallShowsPzOnlyCards(hall) {
  const h = normalizeClubStatsHall(hall)
  return !h || h === 'pz'
}

/**
 * @param {object[]|null|undefined} memberships
 * @param {object|null|undefined} client
 * @param {ClubStatsHall} hall
 */
function hasMembershipOfHall(memberships, client, hall) {
  const want = normalizeClubStatsHall(hall)
  if (!want) return false
  return (Array.isArray(memberships) ? memberships : []).some(
    (m) => membershipHallOf(m, client) === want,
  )
}

/**
 * Клиент попадает в census зала.
 * @param {object|null|undefined} client
 * @param {ClubStatsHall} hall
 * @param {object[]|null|undefined} memberships
 * @param {{ holdingTrainerIds?: Set<string>|string[] }} [opts]
 */
export function clientMatchesClubStatsHall(client, hall, memberships, opts = {}) {
  const want = normalizeClubStatsHall(hall)
  if (!want || !client) return false
  if (isClientArchived(client)) return false
  if (String(client?.lifecycle ?? 'active') === 'pnk') return false
  if (isClientOnHoldingTrainer(client, opts.holdingTrainerIds)) return false

  const list = Array.isArray(memberships) ? memberships : []
  const desk = normalizeDeskHall(client.desk_hall)

  if (want === 'tz' || want === 'az') {
    if (hasMembershipOfHall(list, client, want)) return true
    // desk без строк абонов / desk_hall совпадает с вкладкой
    if (desk === want) return true
    return false
  }

  // ПЗ: только абон hall=pz; legacy — нет абонов, не desk, есть тренер
  if (hasMembershipOfHall(list, client, 'pz')) return true
  if (!list.length && !desk && Boolean(String(client?.trainer_id ?? '').trim())) return true
  return false
}

/**
 * @param {object[]} clientRows
 * @param {object[]} membershipRows
 * @param {ClubStatsHall} hall
 * @param {{ holdingTrainerIds?: Set<string>|string[] }} [opts]
 * @returns {{ clients: object[], memberships: object[], clientIdSet: Set<string> }}
 */
export function sliceClubStatsByHall(clientRows, membershipRows, hall, opts = {}) {
  const want = normalizeClubStatsHall(hall)
  if (!want) {
    return {
      clients: clientRows ?? [],
      memberships: membershipRows ?? [],
      clientIdSet: new Set((clientRows ?? []).map((c) => String(c?.id ?? '').trim()).filter(Boolean)),
    }
  }

  /** @type {Map<string, object[]>} */
  const byClient = new Map()
  for (const m of membershipRows ?? []) {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid) continue
    if (!byClient.has(cid)) byClient.set(cid, [])
    byClient.get(cid).push(m)
  }

  const clients = (clientRows ?? []).filter((c) => {
    const id = String(c?.id ?? '').trim()
    return clientMatchesClubStatsHall(c, want, byClient.get(id) ?? [], opts)
  })
  const clientIdSet = new Set(clients.map((c) => String(c?.id ?? '').trim()).filter(Boolean))
  /** @type {Map<string, object>} */
  const clientById = new Map()
  for (const c of clients) {
    const id = String(c?.id ?? '').trim()
    if (id) clientById.set(id, c)
  }

  const memberships = (membershipRows ?? []).filter((m) => {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid || !clientIdSet.has(cid)) return false
    return membershipHallOf(m, clientById.get(cid)) === want
  })

  return { clients, memberships, clientIdSet }
}

/**
 * Тренировки зала: по membership_id → hall; без membership_id — только ПЗ.
 * @param {object[]} trainings
 * @param {object[]} membershipRows full club memberships (для lookup id)
 * @param {Map<string, object>|Record<string, object>|object[]} [clients]
 * @param {ClubStatsHall} hall
 */
export function filterTrainingsByClubStatsHall(trainings, membershipRows, clients, hall) {
  const want = normalizeClubStatsHall(hall)
  if (!want) return trainings ?? []

  const memById = new Map()
  for (const m of membershipRows ?? []) {
    const id = String(m?.id ?? '').trim()
    if (id) memById.set(id, m)
  }

  /** @type {Map<string, object>} */
  const clientById = new Map()
  if (clients instanceof Map) {
    for (const [k, v] of clients) clientById.set(String(k), v)
  } else if (Array.isArray(clients)) {
    for (const c of clients) {
      const id = String(c?.id ?? '').trim()
      if (id) clientById.set(id, c)
    }
  } else if (clients && typeof clients === 'object') {
    for (const [k, v] of Object.entries(clients)) clientById.set(String(k), v)
  }

  return (trainings ?? []).filter((t) => {
    const mid = String(t?.data?.membership_id ?? '').trim()
    if (!mid) return want === 'pz'
    const m = memById.get(mid)
    if (!m) return want === 'pz'
    const client = clientById.get(String(t?.client_id ?? '').trim())
    return membershipHallOf(m, client) === want
  })
}

/**
 * «По типам карт» для ТЗ/АЗ: считаем абоны зала по типу (не тренировки планшета).
 * @param {{
 *   memberships: object[],
 *   membershipTypes?: object[],
 * }} input
 * @returns {{ byType: object[], byTrainerByType: object[], totalCounted: number }}
 */
export function aggregateHallMembershipTypeCensus(input) {
  const memberships = input?.memberships ?? []
  const membershipTypes = input?.membershipTypes ?? []
  const typeCodeById = new Map()
  for (const t of membershipTypes) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    typeCodeById.set(id, String(t.code ?? t.name ?? '').trim() || '—')
  }

  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const m of memberships) {
    const tid = String(m?.membership_type_id ?? '').trim()
    const key = tid || '__none__'
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const byType = [...counts.entries()]
    .map(([typeKey, count]) => ({
      typeId: typeKey === '__none__' ? null : typeKey,
      code: typeKey === '__none__' ? 'Без типа' : typeCodeById.get(typeKey) || '—',
      count,
    }))
    .sort((a, b) => {
      if (a.typeId == null && b.typeId != null) return 1
      if (a.typeId != null && b.typeId == null) return -1
      return b.count - a.count || String(a.code).localeCompare(String(b.code), 'ru')
    })

  const totalCounted = byType.reduce((s, x) => s + x.count, 0)
  return { byType, byTrainerByType: [], totalCounted }
}
