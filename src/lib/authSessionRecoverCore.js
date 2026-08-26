/**
 * Когда после getSession пусто, но в localStorage ещё «есть токены» —
 * нужен refresh; иначе «призрак» UI без JWT.
 */

/**
 * @param {{
 *   hasStoredSession: boolean,
 *   hasLiveSessionUser: boolean,
 *   refreshRestoredUser: boolean,
 * }} p
 * @returns {'ok'|'refresh'|'clear'}
 */
export function planAuthInitWhenStoredEmpty(p) {
  if (p.hasLiveSessionUser) return 'ok'
  if (!p.hasStoredSession) return 'ok'
  if (p.refreshRestoredUser) return 'ok'
  return 'clear'
}

/**
 * После неудачного refresh на wake: если JWT так и нет — сбрасываем призрак.
 * @param {{ hasLiveSessionUser: boolean, refreshError: boolean }} p
 */
export function shouldClearGhostSessionAfterFailedRefresh(p) {
  if (p.hasLiveSessionUser) return false
  return p.refreshError === true
}
