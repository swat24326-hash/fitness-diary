import { membershipSignal } from '../clientListSignals.js'
import { todayLocalIso } from '../dateRu.js'
import {
  isBirthdayToday,
  isClientStaleForAttention,
  isMembershipExpiredRecently,
  STALE_TRAINING_DAYS,
  STALE_MAX_DAYS,
} from './trainerClientOutreachCore.js'
import {
  buildTrainerAttentionSummaryByPrimaryScenario,
  sortClientsForOutreachFilter,
} from './trainerOutreachQueue.js'

export {
  STALE_TRAINING_DAYS,
  STALE_MAX_DAYS,
  daysSinceIsoDate,
  isClientStaleForAttention,
  isTrainerClientInactiveToday,
} from './trainerClientOutreachCore.js'

export const TRAINER_CLIENT_QUICK_FILTERS = [
  'expiring',
  'expired_recent',
  'birthdays',
  'stale',
  'inactive',
  'pnk',
]

/** @param {string} filter */
export function normalizeTrainerClientQuickFilter(filter) {
  const f = String(filter ?? '')
  if (f === 'expired_remaining') return 'expired_recent'
  if (TRAINER_CLIENT_QUICK_FILTERS.includes(f)) return f
  return null
}

/** @param {string} filter */
export function isTrainerClientQuickFilter(filter) {
  return normalizeTrainerClientQuickFilter(filter) != null
}

/** @deprecated используйте isBirthdayToday — оставлено для совместимости verify */
export const ATTENTION_BIRTHDAY_WEEK_DAYS = 7

/**
 * @param {object[]} trainings
 * @returns {Record<string, string>}
 */
export function buildLastCompletedTrainingDateByClientId(trainings) {
  /** @type {Record<string, string>} */
  const last = {}
  for (const t of trainings ?? []) {
    if (t?.status !== 'completed') continue
    const cid = String(t?.client_id ?? '').trim()
    if (!cid) continue
    const k = String(t?.date ?? '').slice(0, 10)
    if (!k) continue
    if (!last[cid] || k > last[cid]) last[cid] = k
  }
  return last
}

/**
 * Сводка на главной: один клиент = один «повод» (приоритет: ДР → истекает → закончился → давно).
 * @param {{
 *   clients?: object[],
 *   memByClient?: Record<string, object[]>,
 *   today?: string,
 *   staleDays?: number,
 * }} input
 */
export function buildTrainerAttentionSummary(input = {}) {
  return buildTrainerAttentionSummaryByPrimaryScenario(input)
}

/**
 * Первый клиент для превью / списка (с учётом сортировки outreach).
 * @param {{
 *   clients?: object[],
 *   memByClient?: Record<string, object[]>,
 *   scenario: string,
 *   today?: string,
 *   staleDays?: number,
 *   staleMaxDays?: number,
 * }} input
 */
export function findFirstOutreachClient(input = {}) {
  const today = String(input.today ?? todayLocalIso())
  const scenario = String(input.scenario ?? '')
  const staleDays = Number(input.staleDays) > 0 ? Number(input.staleDays) : STALE_TRAINING_DAYS
  const staleMaxDays = Number(input.staleMaxDays) > 0 ? Number(input.staleMaxDays) : STALE_MAX_DAYS

  /** @type {object[]} */
  const matched = []
  for (const c of input.clients ?? []) {
    if (c?.archived_at) continue
    // ПНК не в Max-сценариях абона (см. resolvePrimaryOutreachScenarioForClient).
    if (String(c?.lifecycle ?? '') === 'pnk') continue
    const memList = input.memByClient?.[c.id] ?? []
    if (scenario === 'birthdays' && isBirthdayToday(c.birth_date, today)) matched.push(c)
    else if (scenario === 'expiring' && membershipSignal(memList, today).key === 'expiring') matched.push(c)
    else if (scenario === 'expired_recent' && isMembershipExpiredRecently(memList, today)) matched.push(c)
    else if (scenario === 'stale' && isClientStaleForAttention({ memList, today, staleDays, staleMaxDays })) {
      matched.push(c)
    }
  }

  const sorted = sortClientsForOutreachFilter(matched, scenario, input.memByClient ?? {}, new Set(), today)
  return sorted[0] ?? null
}
