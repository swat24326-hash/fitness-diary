import { isBirthdayWithinNextDays, BIRTHDAY_WINDOW_DAYS } from '../clientBirthdays.js'
import { membershipSignal } from '../clientListSignals.js'
import { todayLocalIso } from '../dateRu.js'

/** Дней без завершённой тренировки — «давно не был». */
export const STALE_TRAINING_DAYS = 14

/** На главной: ДР «на неделе» (отдельно от фильтра списка на 30 дн.). */
export const ATTENTION_BIRTHDAY_WEEK_DAYS = 7

export const TRAINER_CLIENT_QUICK_FILTERS = ['expiring', 'expired_remaining', 'birthdays', 'stale']

/** @param {string} filter */
export function isTrainerClientQuickFilter(filter) {
  return TRAINER_CLIENT_QUICK_FILTERS.includes(String(filter ?? ''))
}

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
  const sig = membershipSignal(ctx.memList ?? [], today)
  if (!['active', 'expiring', 'expired_remaining'].includes(sig.key)) return false

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
 *   birthdayWeekDays?: number,
 * }} input
 */
export function buildTrainerAttentionSummary(input = {}) {
  const today = String(input.today ?? todayLocalIso())
  const staleDays = Number(input.staleDays) > 0 ? Number(input.staleDays) : STALE_TRAINING_DAYS
  const birthdayWeekDays =
    Number(input.birthdayWeekDays) > 0 ? Number(input.birthdayWeekDays) : ATTENTION_BIRTHDAY_WEEK_DAYS
  const memByClient = input.memByClient ?? {}
  const lastCompletedByClientId = input.lastCompletedByClientId ?? {}

  let birthdaysWeek = 0
  let expiring = 0
  let expired_remaining = 0
  let stale = 0

  for (const c of input.clients ?? []) {
    if (c?.archived_at) continue
    const memList = memByClient[c.id] ?? []
    if (isBirthdayWithinNextDays(c.birth_date, today, birthdayWeekDays)) birthdaysWeek++

    const sig = membershipSignal(memList, today)
    if (sig.key === 'expiring') expiring++
    if (sig.key === 'expired_remaining') expired_remaining++

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

  const actionable = birthdaysWeek + expiring + expired_remaining + stale

  return {
    birthdaysWeek,
    expiring,
    expired_remaining,
    stale,
    actionable,
    staleDays,
    birthdayWeekDays,
    birthdayListDays: BIRTHDAY_WINDOW_DAYS,
  }
}
