/**
 * После локального completed: уведомить другие экраны, reconcile used, фоновый push (online).
 * Не блокирует UI — вызывать через void runTrainingCompleteFollowUp(clientId).
 */

import { notifyAdminClientsBrowseStorageChanged } from './admin/adminClientsListReloadCore.js'
import { getDb } from './localDb.js'
import { reconcileMembershipUsedForClient } from '../membership/membershipUsedReconcile.js'
import { scheduleBackgroundSyncDrain } from '../syncService.js'

export const TRAINING_COMPLETE_REASON = 'training-completed'
export const MEMBERSHIP_USED_RECONCILED_REASON = 'membership-used-reconciled'

async function resolveClientClubId(clientId) {
  try {
    const db = await getDb()
    const row = await db.get('clients', clientId)
    return String(row?.club_id ?? '').trim()
  } catch {
    return ''
  }
}

/**
 * @param {string} clientId
 */
export function runTrainingCompleteFollowUp(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return

  void (async () => {
    const clubId = await resolveClientClubId(cid)
    notifyAdminClientsBrowseStorageChanged({
      reason: TRAINING_COMPLETE_REASON,
      clientId: cid,
      clubId,
    })
  })()

  void reconcileMembershipUsedForClient(cid).then(async ({ patchedCount }) => {
    if (patchedCount > 0) {
      const clubId = await resolveClientClubId(cid)
      notifyAdminClientsBrowseStorageChanged({
        reason: MEMBERSHIP_USED_RECONCILED_REASON,
        clientId: cid,
        clubId,
      })
    }
  })

  scheduleBackgroundSyncDrain()
}
