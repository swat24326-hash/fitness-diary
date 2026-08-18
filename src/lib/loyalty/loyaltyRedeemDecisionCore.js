/**
 * Решение о списании куша (400/409), без HTTP.
 */

import { assertRedeemAllowed } from './loyaltyAccountCore.js'
import { LOYALTY_ERR } from './loyaltyAccessCore.js'

/**
 * @param {{
 *   snapshot?: { enabled?: boolean, points?: number, can_redeem?: boolean },
 *   expected_points?: unknown,
 * }} p
 */
export function decideLoyaltyRedeem(p = {}) {
  const snapshot = p.snapshot ?? {}
  if (snapshot.enabled !== true) {
    return { ok: false, status: 400, error: LOYALTY_ERR.programOff }
  }
  const expected = Number(p.expected_points)
  if (!Number.isFinite(expected)) {
    return { ok: false, status: 409, error: LOYALTY_ERR.stalePoints }
  }
  if (snapshot.can_redeem !== true) {
    return { ok: false, status: 400, error: LOYALTY_ERR.cannotRedeem }
  }
  if (!assertRedeemAllowed({ expected, points: snapshot.points, can_redeem: true })) {
    return { ok: false, status: 409, error: LOYALTY_ERR.stalePoints }
  }
  return { ok: true, points: Number(snapshot.points) }
}
