/**
 * Фильтры списка клиентов тренера: chip = list (без поиска).
 * Исключение ДР: плитка = сегодня, список = browse-окно (сегодня + ближайшие).
 */

import { membershipSignal } from '../clientListSignals.js'
import { isBirthdayBrowseMatch, isBirthdayToday } from '../clientBirthdays.js'
import {
  isClientStaleForAttention,
  isMembershipExpiredRecently,
  isTrainerClientInactiveToday,
  STALE_MAX_DAYS,
  STALE_TRAINING_DAYS,
} from './trainerClientOutreachCore.js'
import { isClientAttendanceSlip } from '../clientAttendanceGlanceCore.js'

export const TRAINER_CLIENTS_BROWSE_KEYS = [
  'all',
  'pnk',
  'birthdays',
  'expiring',
  'expired_recent',
  'stale',
  'attendance_slip',
  'inactive',
]

/**
 * @param {object} client
 * @param {string} filterId
 * @param {object[]} memList
 * @param {string} today
 * @param {{ lastTrainingIso?: string | null, trainings?: object[] }} [extra]
 */
export function clientMatchesTrainerBrowseFilter(client, filterId, memList, today, extra = {}) {
  const mode = String(filterId ?? '').trim()
  if (!mode || mode === 'all') return true
  if (mode === 'pnk') return String(client?.lifecycle ?? '') === 'pnk'
  // Список: сегодня + ближайшие. Цифра на чипе — только сегодня (см. buildTrainerClientsBrowseCounts).
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
  if (mode === 'attendance_slip') {
    return isClientAttendanceSlip({
      client,
      memList: list,
      today,
      hallMode: 'pz',
      ...(Object.prototype.hasOwnProperty.call(extra, 'lastTrainingIso')
        ? { lastTrainingIso: extra.lastTrainingIso }
        : {}),
      ...(Array.isArray(extra.trainings) ? { trainings: extra.trainings } : {}),
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
 * @param {{ lastTrainingByClient?: Record<string, string>, trainingsByClientId?: Record<string, object[]> }} [extra]
 */
export function filterTrainerClientsByBrowseMode(clients, memByClient, today, browseMode, extra = {}) {
  const mode = String(browseMode ?? 'all').trim() || 'all'
  const base = Array.isArray(clients) ? clients : []
  if (mode === 'all') return base
  return base.filter((c) => {
    const id = String(c?.id ?? '')
    const hasLast = Object.prototype.hasOwnProperty.call(extra.lastTrainingByClient ?? {}, id)
    const hasTrainings = Object.prototype.hasOwnProperty.call(extra.trainingsByClientId ?? {}, id)
    return clientMatchesTrainerBrowseFilter(c, mode, memByClient[c.id] ?? memByClient[id] ?? [], today, {
      ...(hasLast ? { lastTrainingIso: extra.lastTrainingByClient[id] } : {}),
      ...(hasTrainings ? { trainings: extra.trainingsByClientId[id] } : {}),
    })
  })
}

/**
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} today
 * @param {{ lastTrainingByClient?: Record<string, string>, trainingsByClientId?: Record<string, object[]> }} [extra]
 */
export function buildTrainerClientsBrowseCounts(clients, memByClient, today, extra = {}) {
  const base = Array.isArray(clients) ? clients : []
  let expiring = 0
  let expired_recent = 0
  let birthdays = 0
  let stale = 0
  let attendance_slip = 0
  let inactive = 0
  let pnk = 0
  for (const c of base) {
    const id = String(c?.id ?? '')
    const memList = memByClient[c.id] ?? memByClient[id] ?? []
    const hasLast = Object.prototype.hasOwnProperty.call(extra.lastTrainingByClient ?? {}, id)
    const hasTrainings = Object.prototype.hasOwnProperty.call(extra.trainingsByClientId ?? {}, id)
    const rowExtra = {
      ...(hasLast ? { lastTrainingIso: extra.lastTrainingByClient[id] } : {}),
      ...(hasTrainings ? { trainings: extra.trainingsByClientId[id] } : {}),
    }
    if (clientMatchesTrainerBrowseFilter(c, 'expiring', memList, today, rowExtra)) expiring++
    if (clientMatchesTrainerBrowseFilter(c, 'expired_recent', memList, today, rowExtra)) expired_recent++
    if (isBirthdayToday(c?.birth_date, today)) birthdays++
    if (clientMatchesTrainerBrowseFilter(c, 'stale', memList, today, rowExtra)) stale++
    if (clientMatchesTrainerBrowseFilter(c, 'attendance_slip', memList, today, rowExtra)) attendance_slip++
    if (clientMatchesTrainerBrowseFilter(c, 'inactive', memList, today, rowExtra)) inactive++
    if (clientMatchesTrainerBrowseFilter(c, 'pnk', memList, today, rowExtra)) pnk++
  }
  return {
    all: base.length,
    expiring,
    expired_recent,
    birthdays,
    stale,
    attendance_slip,
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
export function verifyTrainerClientsBrowseChipParity(clients, memByClient, today, keys, extra = {}) {
  const counts = buildTrainerClientsBrowseCounts(clients, memByClient, today, extra)
  const listKeys = keys ?? TRAINER_CLIENTS_BROWSE_KEYS
  /** @type {Array<{ key: string, chip: number, list: number }>} */
  const mismatches = []
  for (const key of listKeys) {
    if (key === 'birthdays') continue
    const listLen = filterTrainerClientsByBrowseMode(clients, memByClient, today, key, extra).length
    const chip = Number(counts[key]) || 0
    if (chip !== listLen) mismatches.push({ key, chip, list: listLen })
  }
  return { ok: mismatches.length === 0, mismatches }
}
