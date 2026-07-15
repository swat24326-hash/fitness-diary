import { pickUsableMembershipForDate } from '../membershipRules.js'
import { membershipSignal } from '../clientListSignals.js'
import { todayLocalIso } from '../dateRu.js'
import { isBirthdayToday, isMembershipExpiredRecently } from './trainerClientOutreachCore.js'

/** Дней после конца абонемента — «давно не был» (без пересечения с истекает / только что истёк). */
export const STALE_TRAINING_DAYS = 14

export const TRAINER_CLIENT_QUICK_FILTERS = ['expiring', 'expired_recent', 'birthdays', 'stale']

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
 * @param {string} iso
 * @param {string} todayIso
 * @returns {number | null}
 */
export function daysSinceIsoDate(iso, todayIso = todayLocalIso()) {
  const d = String(iso ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const [y1, m1, d1] = d.split('-').map(Number)
  const [y2, m2, d2] = String(todayIso).slice(0, 10).split('-').map(Number)
  const t0 = Date.UTC(y1, m1 - 1, d1)
  const t1 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((t1 - t0) / 86400000)
}

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
 * Последний по end_date абонемент, который уже закончился (end ≤ сегодня).
 * @param {object[]} list
 * @param {string} todayIso
 */
export function pickLatestEndedMembership(list, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  const ended = (list ?? []).filter((m) => {
    const end = String(m?.end_date ?? '').slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(end) && end <= today
  })
  if (!ended.length) return null
  return ended.sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
}

/**
 * «Давно не был»: абонемент закончился ≥ staleDays назад.
 * Не пересекается с активным / истекает (1–3 дн.) / только что истёк (0–1 дн.).
 *
 * @param {{
 *   memList?: object[],
 *   today?: string,
 *   staleDays?: number,
 * }} ctx
 */
export function isClientStaleForAttention(ctx = {}) {
  const today = String(ctx.today ?? todayLocalIso())
  const staleDays = Number(ctx.staleDays) > 0 ? Number(ctx.staleDays) : STALE_TRAINING_DAYS
  const memList = ctx.memList ?? []

  if (pickUsableMembershipForDate(memList, today)) return false
  if (isMembershipExpiredRecently(memList, today)) return false

  const latestEnded = pickLatestEndedMembership(memList, today)
  if (!latestEnded) return false

  const days = daysSinceIsoDate(latestEnded.end_date, today)
  if (days == null) return false
  return days >= staleDays
}

/**
 * @param {{
 *   clients?: object[],
 *   memByClient?: Record<string, object[]>,
 *   today?: string,
 *   staleDays?: number,
 * }} input
 */
export function buildTrainerAttentionSummary(input = {}) {
  const today = String(input.today ?? todayLocalIso())
  const staleDays = Number(input.staleDays) > 0 ? Number(input.staleDays) : STALE_TRAINING_DAYS
  const memByClient = input.memByClient ?? {}

  let birthdays = 0
  let expiring = 0
  let expired_recent = 0
  let stale = 0

  for (const c of input.clients ?? []) {
    if (c?.archived_at) continue
    const memList = memByClient[c.id] ?? []
    if (isBirthdayToday(c.birth_date, today)) birthdays++

    const sig = membershipSignal(memList, today)
    if (sig.key === 'expiring') expiring++
    if (isMembershipExpiredRecently(memList, today)) expired_recent++

    if (isClientStaleForAttention({ memList, today, staleDays })) {
      stale++
    }
  }

  const actionable = birthdays + expiring + expired_recent + stale

  return {
    birthdays,
    expiring,
    expired_recent,
    stale,
    actionable,
    staleDays,
  }
}

/**
 * Первый клиент для превью сообщения на главной.
 * @param {{
 *   clients?: object[],
 *   memByClient?: Record<string, object[]>,
 *   scenario: string,
 *   today?: string,
 *   staleDays?: number,
 * }} input
 */
export function findFirstOutreachClient(input = {}) {
  const today = String(input.today ?? todayLocalIso())
  const scenario = String(input.scenario ?? '')
  const staleDays = Number(input.staleDays) > 0 ? Number(input.staleDays) : STALE_TRAINING_DAYS

  for (const c of input.clients ?? []) {
    if (c?.archived_at) continue
    const memList = input.memByClient?.[c.id] ?? []
    if (scenario === 'birthdays' && isBirthdayToday(c.birth_date, today)) return c
    if (scenario === 'expiring' && membershipSignal(memList, today).key === 'expiring') return c
    if (scenario === 'expired_recent' && isMembershipExpiredRecently(memList, today)) return c
    if (scenario === 'stale' && isClientStaleForAttention({ memList, today, staleDays })) {
      return c
    }
  }
  return null
}
