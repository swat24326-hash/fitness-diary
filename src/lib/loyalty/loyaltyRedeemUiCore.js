/**
 * Кнопка списать и тексты ошибок. Без React / fetch.
 */

import {
  LOYALTY_ERR,
  LOYALTY_REDEEM_COMMENT_MAX,
  clipLoyaltyRedeemComment,
} from './loyaltyAccessCore.js'
import { decideLoyaltyRedeem } from './loyaltyRedeemDecisionCore.js'

export const LOYALTY_OFFLINE_REDEEM = 'Списание только при сети.'

/**
 * Sales + admin. Тренер и управляющий — нет кнопки (вкладка только смотреть).
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isTrainer?: boolean, isSupervisor?: boolean }} role
 */
export function canShowLoyaltyRedeemButton(role = {}) {
  if (role.isAdmin === true) return true
  if (role.isSalesManager === true && role.isAdmin !== true) return true
  return false
}

/**
 * @param {{
 *   role?: object,
 *   online?: boolean,
 *   snapshot?: object | null,
 *   busy?: boolean,
 * }} p
 */
export function loyaltyRedeemButtonState(p = {}) {
  const show = canShowLoyaltyRedeemButton(p.role)
  if (!show) return { show: false, disabled: true, reason: '' }
  if (p.online !== true) {
    return { show: true, disabled: true, reason: LOYALTY_OFFLINE_REDEEM }
  }
  if (p.busy === true) {
    return { show: true, disabled: true, reason: '' }
  }
  if (!p.snapshot) {
    return { show: true, disabled: true, reason: '' }
  }
  const decided = decideLoyaltyRedeem({
    snapshot: p.snapshot ?? {},
    expected_points: p.snapshot?.points,
  })
  if (!decided.ok) {
    return { show: true, disabled: true, reason: decided.error || LOYALTY_ERR.cannotRedeem }
  }
  return { show: true, disabled: false, reason: '' }
}

/**
 * @param {unknown} points
 */
export function loyaltyRedeemConfirmText(points) {
  const n = Number(points)
  const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
  return `Списать ${v} баллов? Списывается всё сразу.`
}

/**
 * @param {{ clientId?: string, snapshot?: object, comment?: string }} p
 */
export function buildLoyaltyRedeemBody(p = {}) {
  const client_id = String(p.clientId ?? '').trim()
  const expected = Number(p.snapshot?.points)
  return {
    client_id,
    expected_points: Number.isFinite(expected) ? expected : null,
    comment: clipLoyaltyRedeemComment(p.comment),
  }
}

/**
 * @param {{ status?: number, message?: string, error?: string } | null | undefined} err
 */
export function loyaltyRedeemErrorText(err) {
  const msg = String(err?.error ?? err?.message ?? '').trim()
  if (msg) return msg
  const status = Number(err?.status)
  if (status === 409) return LOYALTY_ERR.stalePoints
  if (status === 403) return LOYALTY_ERR.trainerRedeem
  if (status === 400) return LOYALTY_ERR.cannotRedeem
  return 'Не удалось списать баллы'
}

export { LOYALTY_REDEEM_COMMENT_MAX, clipLoyaltyRedeemComment }
