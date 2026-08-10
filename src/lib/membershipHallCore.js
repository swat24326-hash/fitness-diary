/**
 * Зал абонемента: pz | tz | az.
 * Канон: один client — много memberships с разным hall (см. docs/CLIENT_MULTI_HALL.md).
 */

import { normalizeDeskHall } from './admin/deskHallClientsCore.js'

/** @typedef {'pz'|'tz'|'az'} MembershipHall */

export const MEMBERSHIP_HALLS = /** @type {const} */ (['pz', 'tz', 'az'])

/**
 * @param {unknown} raw
 * @returns {MembershipHall|null}
 */
export function normalizeMembershipHall(raw) {
  const h = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (h === 'pz' || h === 'пз') return 'pz'
  if (h === 'tz' || h === 'тз') return 'tz'
  if (h === 'az' || h === 'аз') return 'az'
  return null
}

/**
 * Угадать hall абона по клиенту (backfill / legacy без поля).
 * @param {object|null|undefined} client
 * @returns {MembershipHall}
 */
export function inferMembershipHallFromClient(client) {
  const desk = normalizeDeskHall(client?.desk_hall)
  if (desk) return desk
  return 'pz'
}

/**
 * @param {object|null|undefined} membership
 * @param {object|null|undefined} [client] fallback для legacy
 * @returns {MembershipHall}
 */
export function membershipHallOf(membership, client) {
  const fromMem = normalizeMembershipHall(membership?.hall)
  if (fromMem) return fromMem
  return inferMembershipHallFromClient(client)
}

/**
 * Есть ли у клиента абон указанного зала.
 * @param {object[]|null|undefined} memberships
 * @param {MembershipHall} hall
 * @param {object|null|undefined} [client]
 */
export function clientHasMembershipHall(memberships, hall, client) {
  const want = normalizeMembershipHall(hall)
  if (!want) return false
  const list = Array.isArray(memberships) ? memberships : []
  if (list.some((m) => membershipHallOf(m, client) === want)) return true
  // legacy без memberships в вызове: только desk_hall / trainer
  if (!list.length && client) {
    if (want === 'tz' || want === 'az') return normalizeDeskHall(client.desk_hall) === want
    if (want === 'pz') {
      return (
        !normalizeDeskHall(client.desk_hall) &&
        (Boolean(String(client?.trainer_id ?? '').trim()) ||
          String(client?.lifecycle ?? '') === 'pnk' ||
          Boolean(client?.pnk_created_at))
      )
    }
  }
  return false
}

/**
 * Набор залов, в которых клиент «есть» для списков.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memberships
 * @returns {Set<MembershipHall>}
 */
export function clientMembershipHallSet(client, memberships) {
  /** @type {Set<MembershipHall>} */
  const set = new Set()
  const list = Array.isArray(memberships) ? memberships : []
  for (const m of list) {
    const h = membershipHallOf(m, client)
    if (h) set.add(h)
  }
  if (!list.length && client) {
    const desk = normalizeDeskHall(client.desk_hall)
    if (desk) set.add(desk)
    else set.add('pz') // legacy: без desk_hall → вкладка ПЗ
  } else if (client) {
    const desk = normalizeDeskHall(client.desk_hall)
    if (desk && !set.has(desk)) set.add(desk)
    if (
      !set.has('pz') &&
      (String(client?.lifecycle ?? '') === 'pnk' ||
        Boolean(client?.pnk_created_at) ||
        Boolean(String(client?.trainer_id ?? '').trim()))
    ) {
      set.add('pz')
    }
  }
  return set
}

/**
 * Абоны одного зала (для вкладок карточки / ledger).
 * @param {object[]|null|undefined} memberships
 * @param {MembershipHall|string|null|undefined} hall
 * @param {object|null|undefined} [client]
 */
export function filterMembershipsByHall(memberships, hall, client) {
  const want = normalizeMembershipHall(hall)
  if (!want) return Array.isArray(memberships) ? memberships : []
  return (Array.isArray(memberships) ? memberships : []).filter(
    (m) => membershipHallOf(m, client) === want,
  )
}

/**
 * Можно ли полностью удалить client при отказе ПНК.
 * false → снять только ПНК/БЗ, сохранить карточку.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memberships
 * @param {{ hasNonTrialPz?: boolean, hasNonBzTrainings?: boolean }} [extra]
 */
export function canFullyDeleteClientOnPnkRefuse(client, memberships, extra = {}) {
  const halls = clientMembershipHallSet(client, memberships)
  if (halls.has('tz') || halls.has('az')) return false
  if (extra.hasNonTrialPz) return false
  if (extra.hasNonBzTrainings) return false
  // платный pz (не БЗ) — смотрим memberships с hall pz и type не trial — caller может передать
  const list = Array.isArray(memberships) ? memberships : []
  for (const m of list) {
    if (membershipHallOf(m, client) !== 'pz') continue
    // без типа: если total_trainings > 2 или paid — скорее не БЗ
    const paid = Number(m?.paid_amount)
    if (Number.isFinite(paid) && paid > 0) return false
  }
  return true
}
