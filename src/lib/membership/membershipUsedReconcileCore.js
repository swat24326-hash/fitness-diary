/**
 * Чистый reconcile used_trainings — без IDB/React (verify + UI + follow-up).
 */

import { completedTrainingsOnMembership } from '../membershipRules.js'

/**
 * @param {object[]} memberships
 * @param {object[]} trainings
 * @returns {Array<{ membership: object, nextUsed: number }>}
 */
export function planMembershipUsedReconcile(memberships, trainings) {
  const out = []
  for (const m of memberships ?? []) {
    if (!m?.id) continue
    const usedComputed = completedTrainingsOnMembership(m, trainings).length
    const usedStored = Number(m?.used_trainings ?? 0)
    if (!Number.isFinite(usedComputed) || usedComputed < 0) continue
    if (usedComputed === usedStored) continue
    out.push({ membership: m, nextUsed: usedComputed })
  }
  return out
}
