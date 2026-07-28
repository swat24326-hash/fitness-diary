/**
 * ЗП тренера по своим завершённым тренировкам (локальный журнал), не отчёт продаж.
 */

import { aggregateMembershipTypeStats } from '../admin/membershipTypeStatsAgg.js'
import {
  buildTrainerPayRateMap,
  computePayrollFromMembershipStats,
} from '../admin/trainerPayrollCore.js'

/**
 * @param {{
 *   trainings: object[],
 *   memberships: object[],
 *   membershipTypes: object[],
 *   trainerId: string,
 *   dateFrom: string,
 *   dateTo: string,
 * }} input
 */
export function computeTrainerSelfPayroll(input) {
  const trainerId = String(input.trainerId ?? '').trim()
  const dateFrom = String(input.dateFrom ?? '').slice(0, 10)
  const dateTo = String(input.dateTo ?? '').slice(0, 10)
  if (!trainerId || !dateFrom || !dateTo || dateFrom > dateTo) return 0

  const filtered = (input.trainings ?? []).filter((t) => {
    if (String(t.trainer_id ?? '').trim() !== trainerId) return false
    if (t.status !== 'completed') return false
    const d = String(t.date ?? '').slice(0, 10)
    return d && d >= dateFrom && d <= dateTo
  })

  const stats = aggregateMembershipTypeStats({
    trainings: filtered,
    memberships: input.memberships ?? [],
    membershipTypes: input.membershipTypes ?? [],
    trainerIdFilter: trainerId,
  })
  const rateMap = buildTrainerPayRateMap(input.membershipTypes ?? [])
  const pay = computePayrollFromMembershipStats(stats, rateMap, { trainerIdFilter: trainerId })
  return pay.clubTotal
}

/** Подпись для UI при слабой сети планшета. */
export function payrollFallbackLabel(reason, { retrying = false } = {}) {
  const r = String(reason ?? '')
  if (/timeout|частично/i.test(r)) {
    return retrying
      ? 'Сеть медленная — повторяю загрузку из облака…'
      : 'Сеть на планшете медленная. Цифры могут быть неполными — обновлю ещё раз или нажмите Sync.'
  }
  if (!r) return null
  return `Резерв: локальный кэш. Причина: ${r}`
}
