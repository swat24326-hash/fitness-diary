/**
 * Факт визитов на главной /me: уникальные даты персоналок + списаний АЗ (session_visits).
 * Канон: docs/CLIENT_APP.md § «Мои тренировки».
 */
import { normalizeSessionVisits } from '../admin/deskAzSessionDeductCore.js'
import { isLoyaltyNoShowTraining } from '../loyalty/loyaltyTrainingEligibleCore.js'
import { normalizeMembershipHall } from '../membershipHallCore.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const day = (v) => String(v ?? '').slice(0, 10)

/**
 * Уникальные календарные дни с фактом тренировки (≤ today).
 * @param {object[]|null|undefined} trainings
 * @param {object[]|null|undefined} memberships сырые memberships с session_visits / hall
 * @param {string} todayIso
 * @returns {string[]} по возрастанию
 */
export function collectClientVisitDates(trainings, memberships, todayIso) {
  const today = day(todayIso)
  /** @type {Set<string>} */
  const set = new Set()
  for (const t of trainings ?? []) {
    if (t?.status !== 'completed' || isLoyaltyNoShowTraining(t)) continue
    const d = day(t.date)
    if (ISO.test(d) && d <= today) set.add(d)
  }
  for (const m of memberships ?? []) {
    const hall = normalizeMembershipHall(m?.hall) ?? 'pz'
    if (hall !== 'az') continue
    for (const v of normalizeSessionVisits(m?.session_visits)) {
      if (v.date <= today) set.add(v.date)
    }
  }
  return [...set].sort()
}
