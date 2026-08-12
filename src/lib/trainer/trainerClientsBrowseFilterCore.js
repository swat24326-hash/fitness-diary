/**
 * Фильтры списка клиентов тренера: chip = list (без поиска).
 * Сценарии outreach на главной («ДР сегодня») — отдельно; здесь browse-окно ДР.
 */

import { membershipSignal } from '../clientListSignals.js'
import { isBirthdayBrowseMatch } from '../clientBirthdays.js'
import {
  isClientStaleForAttention,
  isMembershipExpiredRecently,
  isTrainerClientInactiveToday,
  STALE_MAX_DAYS,
  STALE_TRAINING_DAYS,
} from './trainerClientOutreachCore.js'

export const TRAINER_CLIENTS_BROWSE_KEYS = [
  'all',
  'pnk',
  'birthdays',
  'expiring',
  'expired_recent',
  'stale',
  'inactive',
]

/**
 * @param {object} client
 * @param {string} filterId
 * @param {object[]} memList
 * @param {string} today
 */
export function clientMatchesTrainerBrowseFilter(client, filterId, memList, today) {
  const mode = String(filterId ?? '').trim()
  if (!mode || mode === 'all') return true
  if (mode === 'pnk') return String(client?.lifecycle ?? '') === 'pnk'
  // Список и chip: сегодня + ближайшие (как у админа).
  if (mode === 'birthdays') return isBirthdayBrowseMatch(client?.birth_date, today)

  if (
    String(client?.lifecycle ?? '') === 'pnk' &&
    (mode === 'expiring' ||
      mode === 'expired_recent' ||
      mode === 'stale' ||
      mode === 'inactive')
  ) {
    return false
  }

  const list = memList ?? []
  if (mode === 'expiring') return membershipSignal(list, today).key === 'expiring'
  if (mode === 'expired_recent') return isMembershipExpiredRecently(list, today)
  if (mode === 'stale') {
    return isClientStaleForAttention({
      memList: list,
      today,
      staleDays: STALE_TRAINING_DAYS,
      staleMaxDays: STALE_MAX_DAYS,
    })
  }
  if (mode === 'inactive') return isTrainerClientInactiveToday(client, list, today)
  return false
}

/**
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} today
 * @param {string} browseMode
 */
export function filterTrainerClientsByBrowseMode(clients, memByClient, today, browseMode) {
  const mode = String(browseMode ?? 'all').trim() || 'all'
  const base = Array.isArray(clients) ? clients : []
  if (mode === 'all') return base
  return base.filter((c) =>
    clientMatchesTrainerBrowseFilter(c, mode, memByClient[c.id] ?? memByClient[String(c.id)] ?? [], today),
  )
}

/**
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} today
 */
export function buildTrainerClientsBrowseCounts(clients, memByClient, today) {
  const base = Array.isArray(clients) ? clients : []
  let expiring = 0
  let expired_recent = 0
  let birthdays = 0
  let stale = 0
  let inactive = 0
  let pnk = 0
  for (const c of base) {
    const memList = memByClient[c.id] ?? memByClient[String(c.id)] ?? []
    if (clientMatchesTrainerBrowseFilter(c, 'expiring', memList, today)) expiring++
    if (clientMatchesTrainerBrowseFilter(c, 'expired_recent', memList, today)) expired_recent++
    if (clientMatchesTrainerBrowseFilter(c, 'birthdays', memList, today)) birthdays++
    if (clientMatchesTrainerBrowseFilter(c, 'stale', memList, today)) stale++
    if (clientMatchesTrainerBrowseFilter(c, 'inactive', memList, today)) inactive++
    if (clientMatchesTrainerBrowseFilter(c, 'pnk', memList, today)) pnk++
  }
  return {
    all: base.length,
    expiring,
    expired_recent,
    birthdays,
    stale,
    inactive,
    pnk,
  }
}

/**
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} today
 * @param {string[]} [keys]
 */
export function verifyTrainerClientsBrowseChipParity(clients, memByClient, today, keys) {
  const counts = buildTrainerClientsBrowseCounts(clients, memByClient, today)
  const listKeys = keys ?? TRAINER_CLIENTS_BROWSE_KEYS
  /** @type {Array<{ key: string, chip: number, list: number }>} */
  const mismatches = []
  for (const key of listKeys) {
    const listLen = filterTrainerClientsByBrowseMode(clients, memByClient, today, key).length
    const chip = Number(counts[key]) || 0
    if (chip !== listLen) mismatches.push({ key, chip, list: listLen })
  }
  return { ok: mismatches.length === 0, mismatches }
}
