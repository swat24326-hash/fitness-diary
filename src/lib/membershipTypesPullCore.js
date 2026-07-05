/**
 * Правила pull типов абонементов (без IDB/React — для verify и сервиса).
 */

/**
 * @param {{ localActiveCount: number, force?: boolean, offline?: boolean }} opts
 */
export function shouldPullMembershipTypes({ localActiveCount, force = false, offline = false }) {
  if (offline) return false
  if (force) return true
  return Number(localActiveCount) <= 0
}
