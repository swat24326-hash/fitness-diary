import { isSalesManagerRole } from './salesAccessCore.js'
import { isSupervisorRole } from './supervisorAccessCore.js'

/**
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isSupervisor?: boolean, user?: { club_id?: string }, profile?: { club_id?: string }, salesClubId?: string, supervisorClubId?: string }} ctx
 * @param {string} clubId
 */
export function canCreateClubDispatch(ctx, clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return false
  if (ctx?.isAdmin) return true
  const mgrClub = String(
    ctx?.supervisorClubId ?? ctx?.salesClubId ?? ctx?.user?.club_id ?? ctx?.profile?.club_id ?? '',
  ).trim()
  if (ctx?.isSupervisor || ctx?.isSalesManager) {
    return Boolean(mgrClub && mgrClub === cid)
  }
  return false
}

/**
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isSupervisor?: boolean }} ctx
 */
export function canViewClubDispatchSent(ctx) {
  return Boolean(ctx?.isAdmin || ctx?.isSalesManager || ctx?.isSupervisor)
}

/**
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isSupervisor?: boolean, user?: { club_id?: string }, profile?: { club_id?: string }, salesClubId?: string, supervisorClubId?: string }} ctx
 * @param {string} clubId
 */
export function canStopClubDispatchRecurrence(ctx, clubId) {
  return canCreateClubDispatch(ctx, clubId)
}

/**
 * @param {{ isAdmin?: boolean }} ctx
 */
export function canDeleteClubDispatch(ctx) {
  return Boolean(ctx?.isAdmin)
}

/**
 * @param {string} role
 * @param {string} [taskKind]
 */
export function isDispatchRecipientRole(role, taskKind) {
  const r = String(role ?? '').trim().toLowerCase()
  if (r === 'trainer' || r === 'тренер') return true
  if (isSalesManagerRole(role)) return true
  if (isSupervisorRole(role)) return true
  void taskKind
  return false
}
