/**
 * Reconcile memberships.used_trainings по фактическим completed-тренировкам дневника.
 * Один источник для MembershipManager и post-complete follow-up тренера.
 */

import { listMemberships, listTrainingsForClient } from '../dataAccess.js'
import { saveLocalWithSync } from '../syncService.js'
import { planMembershipUsedReconcile } from './membershipUsedReconcileCore.js'

export { planMembershipUsedReconcile } from './membershipUsedReconcileCore.js'

/**
 * @param {string} clientId
 * @returns {Promise<{ patchedCount: number }>}
 */
export async function reconcileMembershipUsedForClient(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return { patchedCount: 0 }

  const [memberships, trainings] = await Promise.all([listMemberships(cid), listTrainingsForClient(cid)])
  const plan = planMembershipUsedReconcile(memberships, trainings)
  let patchedCount = 0

  for (const { membership, nextUsed } of plan) {
    try {
      await saveLocalWithSync(
        'memberships',
        { ...membership, used_trainings: nextUsed },
        { table_name: 'memberships', operation: 'update', remote_id: membership.id },
      )
      patchedCount += 1
    } catch {
      // UI может показать computed через membershipUsageLabel; не блокируем завершение.
    }
  }

  return { patchedCount }
}
