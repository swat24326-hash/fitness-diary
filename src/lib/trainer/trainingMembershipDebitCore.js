/**
 * Чистый план debit used_trainings — без IDB (verify + UI).
 */

import { membershipCoversDate, membershipHasRemaining } from '../membershipRules.js'

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
  const covering =
    (memberships ?? [])
      .filter((m) => membershipCoversDate(m, dateIso))
      .sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))[0] ?? null
  if (!covering) {
    return {
      ok: false,
      code: MEMBERSHIP_DEBIT_BLOCK.NO_ACTIVE,
      message: 'Нет активного абонемента на текущую дату — списание невозможно.',
    }
  }
  if (!membershipHasRemaining(covering)) {
    return {
      ok: false,
      code: MEMBERSHIP_DEBIT_BLOCK.LIMIT,
      message: 'Лимит тренировок по абонементу исчерпан — списание невозможно.',
    }
  }
  return { ok: true, membership: covering, membershipId: covering.id }
}
