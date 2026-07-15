import { isBirthdayToday, isMembershipExpiredRecently } from './trainerClientOutreachCore.js'
import { membershipSignal } from '../clientListSignals.js'
import { todayLocalIso } from '../dateRu.js'

/** Дней без завершённой тренировки — «давно не был». */
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
 * Клиент «давно не был»: есть смысл тренироваться, но давно не было завершённой тренировки.
 *
 * @param {{
 *   memList?: object[],
 *   lastCompletedIso?: string,
 *   today?: string,
 *   staleDays?: number,
 * }} ctx
 */
export function isClientStaleForAttention(ctx = {}) {
  const today = String(ctx.today ?? todayLocalIso())
  const staleDays = Number(ctx.staleDays) > 0 ? Number(ctx.staleDays) : STALE_TRAINING_DAYS
  const memList = ctx.memList ?? []
  const sig = membershipSignal(memList, today)
  const recentlyExpired = isMembershipExpiredRecently(memList, today)
  if (!['active', 'expiring', 'expired_remaining'].includes(sig.key) && !recentlyExpired) return false

  const last = String(ctx.lastCompletedIso ?? '').trim().slice(0, 10)
  if (!last || last === '—') return true

  const days = daysSinceIsoDate(last, today)
  if (days == null) return true
  return days >= staleDays
}

/**
 * @param {{
 *   clients?: object[],
 *   memByClient?: Record<string, object[]>,
 *   lastCompletedByClientId?: Record<string, string>,
 *   today?: string,
 *   staleDays?: number,
 * }} input
 */
export function buildTrainerAttentionSummary(input = {}) {
  const today = String(input.today ?? todayLocalIso())
  const staleDays = Number(input.staleDays) > 0 ? Number(input.staleDays) : STALE_TRAINING_DAYS
  const memByClient = input.memByClient ?? {}
  const lastCompletedByClientId = input.lastCompletedByClientId ?? {}

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

    if (
      isClientStaleForAttention({
        memList,
        lastCompletedIso: lastCompletedByClientId[c.id],
        today,
        staleDays,
      })
    ) {
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
 *   lastCompletedByClientId?: Record<string, string>,
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
    if (
      scenario === 'stale' &&
      isClientStaleForAttention({
        memList,
        lastCompletedIso: input.lastCompletedByClientId?.[c.id],
        today,
        staleDays,
      })
    ) {
      return c
    }
  }
  return null
}
