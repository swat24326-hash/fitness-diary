import { isSalesManagerRole } from './salesAccessCore.js'

/**
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, user?: { club_id?: string }, profile?: { club_id?: string } }} ctx
 * @param {string} clubId
 */
export function canCreateClubDispatch(ctx, clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return false
  if (ctx?.isAdmin) return true
  if (!ctx?.isSalesManager) return false
  const mgrClub = String(ctx?.user?.club_id ?? ctx?.profile?.club_id ?? '').trim()
  return mgrClub === cid
}

/**
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean }} ctx
 */
export function canViewClubDispatchSent(ctx) {
  return Boolean(ctx?.isAdmin || ctx?.isSalesManager)
}

/**
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, user?: { club_id?: string }, profile?: { club_id?: string } }} ctx
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
  void taskKind
  return false
}
