/**
 * Код подтверждения жёсткого удаления клиента (трение UX, не auth).
 * Памятка для админа — в журнале удалений; в модалке код не показывают.
 */

export const CLIENT_HARD_DELETE_CONFIRM_CODE = '124578'

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isClientHardDeleteConfirmCode(raw) {
  return String(raw ?? '').trim() === CLIENT_HARD_DELETE_CONFIRM_CODE
}
