/**
 * Чистый reconcile used_trainings — без IDB/React (verify + UI + follow-up + coach).
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

/**
 * Применить план к массиву абонов (в памяти) + список патчей для записи в БД/очередь.
 * @param {object[]} memberships
 * @param {object[]} trainings
 * @returns {{ memberships: object[], patches: Array<{ id: string, used_trainings: number }> }}
 */
export function applyMembershipUsedReconcilePlan(memberships, trainings) {
  const plan = planMembershipUsedReconcile(memberships, trainings)
  if (!plan.length) {
    return { memberships: memberships ?? [], patches: [] }
  }
  /** @type {Map<string, number>} */
  const nextById = new Map(plan.map(({ membership, nextUsed }) => [String(membership.id), nextUsed]))
  /** @type {Array<{ id: string, used_trainings: number }>} */
  const patches = []
  const out = (memberships ?? []).map((m) => {
    const id = String(m?.id ?? '')
    const nextUsed = nextById.get(id)
    if (nextUsed == null) return m
    patches.push({ id, used_trainings: nextUsed })
    return { ...m, used_trainings: nextUsed }
  })
  return { memberships: out, patches }
}
