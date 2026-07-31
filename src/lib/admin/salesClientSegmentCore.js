/**
 * Сегмент продажи — в одной линии с фильтрами тренера.
 *
 * ДК — абонемент действует (в т.ч. «истекает»).
 * УК1 (горячий) — после конца абонемента, дней 0 … (gap−1) ≈ фильтр «закончился».
 * УК2 (холодный) — ≥ gap дней после конца (как вход в «давно не был»; для продажи без верхней границы).
 * НК — до продажи не было ни одной завершённой тренировки (и не попал в УК/ДК).
 *
 * Приоритет: УК2 → УК1 → ДК → НК.
 */
import { pickUsableMembershipForDate } from '../membershipRules.js'
import {
  daysSinceIsoDate,
  pickLatestEndedMembership,
  STALE_TRAINING_DAYS,
} from '../trainer/trainerClientOutreachCore.js'

/** Граница УК1 / УК2 (= stale у тренера). */
export const SALE_RETURNING_GAP_DAYS = STALE_TRAINING_DAYS

/** @typedef {'nk'|'dk'|'uk1'|'uk2'} SaleClientSegment */

export const SALE_CLIENT_SEGMENTS = ['nk', 'dk', 'uk1', 'uk2']

/** @type {Record<SaleClientSegment, string>} */
export const SALE_CLIENT_SEGMENT_LABELS = {
  nk: 'НК',
  dk: 'ДК',
  uk1: 'УК1',
  uk2: 'УК2',
}

/**
 * Для отчёта продаж с одним полем profit_uk обе УК кладутся в «uk».
 * @param {SaleClientSegment | string} segment
 * @returns {'nk'|'dk'|'uk'|null}
 */
export function saleSegmentToProfitBucket(segment) {
  if (segment === 'nk') return 'nk'
  if (segment === 'dk') return 'dk'
  if (segment === 'uk1' || segment === 'uk2') return 'uk'
  return null
}

/**
 * @param {object[]} trainings
 * @param {string} saleDate
 * @param {string} [clientId]
 */
export function countCompletedTrainingsBefore(trainings, saleDate, clientId) {
  const sale = String(saleDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sale)) return 0
  const cid = clientId != null ? String(clientId) : ''
  let n = 0
  for (const t of trainings ?? []) {
    if (t?.status !== 'completed') continue
    if (cid && String(t.client_id ?? '') !== cid) continue
    const d = String(t?.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    if (d < sale) n++
  }
  return n
}

/**
 * @param {{
 *   saleDate: string,
 *   memList?: object[],
 *   trainings?: object[],
 *   clientId?: string,
 *   returningGapDays?: number,
 * }} input
 * @returns {{
 *   segment: SaleClientSegment,
 *   reason: string,
 *   label: string,
 *   completedTrainingsBefore: number,
 *   daysSinceEnd: number | null,
 *   hasUsableMembership: boolean,
 *   profitBucket: 'nk'|'dk'|'uk',
 * }}
 */
export function classifySaleClientSegment(input = {}) {
  const saleDate = String(input.saleDate ?? '').slice(0, 10)
  const gapDays =
    Number(input.returningGapDays) > 0 ? Number(input.returningGapDays) : SALE_RETURNING_GAP_DAYS
  const memList = input.memList ?? []
  const trainings = input.trainings ?? []
  const completedTrainingsBefore = countCompletedTrainingsBefore(trainings, saleDate, input.clientId)

  const usable = pickUsableMembershipForDate(memList, saleDate)
  const hasUsableMembership = Boolean(usable)

  let daysSinceEnd = null
  const ended = pickLatestEndedMembership(memList, saleDate)
  if (ended) daysSinceEnd = daysSinceIsoDate(ended.end_date, saleDate)

  // УК2 — холодно: ≥ gap после конца (продажа-возврат; фильтр «давно не был» в UI обрезан сверху)
  if (!hasUsableMembership && daysSinceEnd != null && daysSinceEnd >= gapDays) {
    return {
      segment: 'uk2',
      reason: 'cold_after_membership_end',
      label: SALE_CLIENT_SEGMENT_LABELS.uk2,
      completedTrainingsBefore,
      daysSinceEnd,
      hasUsableMembership,
      profitBucket: 'uk',
    }
  }

  // УК1 — горячо: 0 … gap−1 после конца (фильтр «закончился»)
  if (!hasUsableMembership && daysSinceEnd != null && daysSinceEnd >= 0 && daysSinceEnd < gapDays) {
    return {
      segment: 'uk1',
      reason: 'hot_after_membership_end',
      label: SALE_CLIENT_SEGMENT_LABELS.uk1,
      completedTrainingsBefore,
      daysSinceEnd,
      hasUsableMembership,
      profitBucket: 'uk',
    }
  }

  // ДК — договор действует
  if (hasUsableMembership) {
    return {
      segment: 'dk',
      reason: 'usable_membership',
      label: SALE_CLIENT_SEGMENT_LABELS.dk,
      completedTrainingsBefore,
      daysSinceEnd,
      hasUsableMembership,
      profitBucket: 'dk',
    }
  }

  // НК — не было тренировок (новый без истории в зале)
  if (completedTrainingsBefore === 0) {
    return {
      segment: 'nk',
      reason: 'no_completed_trainings',
      label: SALE_CLIENT_SEGMENT_LABELS.nk,
      completedTrainingsBefore,
      daysSinceEnd,
      hasUsableMembership,
      profitBucket: 'nk',
    }
  }

  // Нет дат абонемента, но тренировки были — мягкий ДК
  return {
    segment: 'dk',
    reason: 'history_without_membership_dates',
    label: SALE_CLIENT_SEGMENT_LABELS.dk,
    completedTrainingsBefore,
    daysSinceEnd,
    hasUsableMembership,
    profitBucket: 'dk',
  }
}

/** Короткая подсказка для UI. */
export function saleClientSegmentHintRu(result) {
  if (!result?.segment) return ''
  if (result.segment === 'uk2') {
    const d = result.daysSinceEnd
    return d != null
      ? `УК2 — ${d} дн. после конца (холодно, ≥${SALE_RETURNING_GAP_DAYS})`
      : 'УК2 — давно после конца абонемента'
  }
  if (result.segment === 'uk1') {
    const d = result.daysSinceEnd
    return d != null
      ? `УК1 — ${d} дн. после конца (горячий, до ${SALE_RETURNING_GAP_DAYS} дн.)`
      : 'УК1 — недавно закончился абонемент'
  }
  if (result.segment === 'nk') {
    return 'НК — до продажи не было тренировок'
  }
  if (result.reason === 'usable_membership') {
    return 'ДК — абонемент действует'
  }
  return 'ДК'
}
