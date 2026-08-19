/**
 * После локального completed: уведомить другие экраны, reconcile used, фоновый push (online).
 * Не блокирует UI — вызывать через void runTrainingCompleteFollowUp(clientId).
 */

import { dispatchLocalDataChanged } from '../localDataEvents.js'
import { reconcileMembershipUsedForClient } from '../membership/membershipUsedReconcile.js'
import { scheduleBackgroundSyncDrain } from '../syncService.js'

export const TRAINING_COMPLETE_REASON = 'training-completed'
export const MEMBERSHIP_USED_RECONCILED_REASON = 'membership-used-reconciled'

/**
 * @param {string} clientId
 */
export function runTrainingCompleteFollowUp(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return

  dispatchLocalDataChanged({ reason: TRAINING_COMPLETE_REASON, clientId: cid })

  void reconcileMembershipUsedForClient(cid).then(({ patchedCount }) => {
    if (patchedCount > 0) {
      dispatchLocalDataChanged({ reason: MEMBERSHIP_USED_RECONCILED_REASON, clientId: cid })
    }
  })

  scheduleBackgroundSyncDrain()
}
