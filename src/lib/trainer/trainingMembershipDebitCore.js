/**
 * Чистый план debit used_trainings — без IDB (verify + UI).
 * Тот же выбор абона, что при открытии тренировки: pickUsableMembershipForDate.
 */

import {
  membershipCoversDate,
  membershipIsSessionDepletedOn,
  pickUsableMembershipForDate,
} from '../membershipRules.js'

export const MEMBERSHIP_DEBIT_BLOCK = {
  NO_ACTIVE: 'no_active',
  LIMIT: 'limit',
}

/**
 * @param {object[]} memberships
 * @param {string} effectiveDate
 * @returns {{ ok: true, membership: object, membershipId: string } | { ok: false, code: string, message: string }}
 */
export function planMembershipFirstCompletionDebit(memberships, effectiveDate) {
  const dateIso = String(effectiveDate ?? '').slice(0, 10)
  const list = memberships ?? []
  const usable = pickUsableMembershipForDate(list, dateIso)
  if (usable) {
    return { ok: true, membership: usable, membershipId: usable.id }
  }

  const anyCovering = list.some((m) => membershipCoversDate(m, dateIso))
  if (!anyCovering) {
    return {
      ok: false,
      code: MEMBERSHIP_DEBIT_BLOCK.NO_ACTIVE,
      message: 'Нет активного абонемента на текущую дату — списание невозможно.',
    }
  }

  // Срок кроет дату, но usable нет: обычно все покрывающие пакеты без остатка.
  const depletedCovering = list.some((m) => membershipIsSessionDepletedOn(m, dateIso))
  if (depletedCovering) {
    return {
      ok: false,
      code: MEMBERSHIP_DEBIT_BLOCK.LIMIT,
      message: 'Лимит тренировок по абонементу исчерпан — списание невозможно.',
    }
  }

  return {
    ok: false,
    code: MEMBERSHIP_DEBIT_BLOCK.NO_ACTIVE,
    message: 'Нет активного абонемента на текущую дату — списание невозможно.',
  }
}
