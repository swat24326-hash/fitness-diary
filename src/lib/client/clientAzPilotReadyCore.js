/**
 * Готовность пилота АЗ в /me: инструкторы + группа по направлению + session_visits.
 * Без React / IDB — CRM-чеклист и verify.
 */

import { normalizeMembershipHall } from '../membershipHallCore.js'
import { clientAzGroupMatchKeys, pickClientNextSession } from './clientAzNextSessionCore.js'
import { normalizeSessionVisits } from '../admin/deskAzSessionDeductCore.js'

/**
 * Абон АЗ с фактом у стойки (иначе вкладка «Тренировки» пустая).
 * @param {object|null|undefined} membership
 */
export function azMembershipHasDeskVisits(membership) {
  if ((normalizeMembershipHall(membership?.hall) ?? 'pz') !== 'az') return false
  return normalizeSessionVisits(membership?.session_visits).length > 0
}

/**
 * Есть хотя бы одна пара инструктор+направление.
 * @param {Array<{ instructor_id?: unknown, direction_type_id?: unknown }>|null|undefined} azLinks
 */
export function azInstructorsAssigned(azLinks) {
  return clientAzGroupMatchKeys(azLinks).size > 0
}

/**
 * Пилот «чистый АЗ»: можно открыть /me без сюрпризов.
 * @param {{
 *   azLinks?: Array<object>|null,
 *   memberships?: Array<object>|null,
 *   groupEntries?: Array<object>|null,
 *   personalEntries?: Array<object>|null,
 *   today?: string,
 *   nowMinutes?: number,
 *   trainerNameById?: Map<string, string>|Record<string, string>|null,
 *   directionNameById?: Map<string, string>|Record<string, string>|null,
 * }} input
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function assessClientAzPilotReady(input = {}) {
  const missing = []
  const links = input.azLinks ?? []
  if (!azInstructorsAssigned(links)) missing.push('назначить инструктора АЗ с направлением')

  const azMems = (input.memberships ?? []).filter(
    (m) => (normalizeMembershipHall(m?.hall) ?? 'pz') === 'az',
  )
  if (!azMems.length) missing.push('живой абонемент АЗ')
  else if (!azMems.some(azMembershipHasDeskVisits)) missing.push('session_visits у абона АЗ (списание у стойки)')

  const names =
    input.trainerNameById instanceof Map
      ? input.trainerNameById
      : new Map(Object.entries(input.trainerNameById ?? {}))
  const dirs =
    input.directionNameById instanceof Map
      ? input.directionNameById
      : new Map(Object.entries(input.directionNameById ?? {}))

  const next = pickClientNextSession({
    personalEntries: input.personalEntries ?? [],
    groupEntries: input.groupEntries ?? [],
    azLinks: links,
    today: input.today ?? '2099-01-01',
    nowMinutes: input.nowMinutes ?? 0,
    trainerNameById: names,
    directionNameById: dirs,
  })
  if (!next) missing.push('групповой слот в ежедневнике (kind=group + то же направление)')

  return { ok: missing.length === 0, missing }
}
