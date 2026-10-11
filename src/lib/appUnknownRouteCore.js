/**
 * Незнакомый адрес в приложении. Обычно это раздел из новой версии (например, /coach), а телефон
 * ещё держит старую сборку: сначала обновиться и открыть тот же адрес, и только потом — на главную.
 */
export const UNKNOWN_ROUTE_TRIED_KEY = 'fd_unknown_route_update_tried'

/**
 * @param {{ path: string, triedPath: string | null, hasNewVersion: boolean }} p
 * @returns {'update' | 'home'}
 */
export function decideUnknownRoute({ path, triedPath, hasNewVersion }) {
  if (!hasNewVersion) return 'home'
  return triedPath === path ? 'home' : 'update'
}
