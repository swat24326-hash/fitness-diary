/**
 * Доступ к прайсу клуба (чистые правила для API + verify).
 */

/**
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isSupervisor?: boolean, salesClubId?: string, supervisorClubId?: string, profile?: { club_id?: string }, user?: { club_id?: string } }} ctx
 * @param {string} clubId
 * @returns {{ ok: true } | { ok: false, error: string, status: number }}
 */
export function assertPriceListClubAccess(ctx, clubId) {
  const id = String(clubId ?? '').trim()
  if (!id) return { ok: false, status: 400, error: 'Укажите club_id' }

  const isAdmin = ctx?.isAdmin === true
  const isSalesManager = ctx?.isSalesManager === true
  const isSupervisor = ctx?.isSupervisor === true

  if (!isAdmin && !isSalesManager && !isSupervisor) {
    return { ok: false, status: 403, error: 'Нет доступа' }
  }

  if ((isSalesManager || isSupervisor) && !isAdmin) {
    const own = String(
      ctx?.supervisorClubId ?? ctx?.salesClubId ?? ctx?.profile?.club_id ?? ctx?.user?.club_id ?? '',
    ).trim()
    if (!own || own !== id) {
      return { ok: false, status: 403, error: 'Нет доступа к прайсу другого клуба' }
    }
  }

  return { ok: true }
}

/**
 * Запись прайса: админ (любой клуб) или менеджер своего клуба.
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, salesClubId?: string, profile?: { club_id?: string }, user?: { club_id?: string } }} ctx
 * @param {string} clubId
 */
export function assertPriceListWriteAccess(ctx, clubId) {
  return assertPriceListClubAccess(ctx, clubId)
}
