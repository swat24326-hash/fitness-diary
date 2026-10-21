/**
 * Можно ли снять пакет вместе с клипом.
 * Нет завершённой тренировки и нет списаний — пакет убираем.
 * Есть тренировка или used_trainings > 0 — пакет не стираем: менеджер правит даты и число,
 * удалить может только админ.
 * Без React / IDB.
 */

import { isAdminByRole } from './adminRoleCore.js'

/**
 * @param {unknown} raw
 * @returns {number}
 */
function nonNegativeCount(raw) {
  const n = Number(raw ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

/**
 * @param {{
 *   completedTrainingsCount?: unknown,
 *   usedTrainings?: unknown,
 *   role?: unknown,
 *   intent?: 'cancel'|'delete',
 * }} [input]
 * @returns {{
 *   action: 'cancel_with_membership'|'keep_membership'|'admin_only',
 *   canRemoveMembership: boolean,
 *   canEdit: boolean,
 *   reason: string,
 * }}
 */
export function planSaleClipCancel(input = {}) {
  const used = nonNegativeCount(input.usedTrainings)
  const completed = nonNegativeCount(input.completedTrainingsCount)
  const blocked = completed > 0 || used > 0
  const admin = isAdminByRole(input.role)

  if (!blocked) {
    return {
      action: 'cancel_with_membership',
      canRemoveMembership: true,
      canEdit: false,
      reason: '',
    }
  }

  const editHint = 'Даты и число занятий может поправить менеджер.'
  if (input.intent === 'delete') {
    if (admin) {
      return {
        action: 'admin_only',
        canRemoveMembership: true,
        canEdit: true,
        reason: '',
      }
    }
    return {
      action: 'admin_only',
      canRemoveMembership: false,
      canEdit: true,
      reason: `По этому абонементу уже есть занятие. Удалить пакет может только админ. ${editHint}`,
    }
  }

  return {
    action: 'keep_membership',
    canRemoveMembership: false,
    canEdit: true,
    reason: `По этому абонементу уже есть занятие. Пакет не снимаем. ${editHint} Удалить пакет может только админ.`,
  }
}
