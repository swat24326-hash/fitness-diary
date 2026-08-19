/**
 * Списание used_trainings при первом completed — IDB + sync.
 */

import { listMemberships } from '../dataAccess.js'
import { saveLocalWithSync } from '../syncService.js'
import { planMembershipFirstCompletionDebit } from './trainingMembershipDebitCore.js'

export { MEMBERSHIP_DEBIT_BLOCK, planMembershipFirstCompletionDebit } from './trainingMembershipDebitCore.js'

/**
 * @param {string} clientId
 * @param {string} effectiveDate
 */
export async function resolveMembershipForFirstCompletionDebit(clientId, effectiveDate) {
  const cid = String(clientId ?? '').trim()
  let mems = []
  try {
    mems = cid ? await listMemberships(cid) : []
  } catch {
    mems = []
  }
  return planMembershipFirstCompletionDebit(mems, effectiveDate)
}

/**
 * @param {object} membership
 * @returns {Promise<number>} nextUsed
 */
export async function applyMembershipFirstCompletionDebit(membership) {
  const used = Number(membership?.used_trainings ?? 0)
  const nextUsed = Number.isFinite(used) ? used + 1 : 1
  await saveLocalWithSync(
    'memberships',
    { ...membership, used_trainings: nextUsed },
    { table_name: 'memberships', operation: 'update', remote_id: membership.id },
  )
  return nextUsed
}
