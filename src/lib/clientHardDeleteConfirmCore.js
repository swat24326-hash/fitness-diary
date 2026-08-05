/**
 * Код подтверждения жёсткого удаления клиента (трение UX, не auth).
 */

export const CLIENT_HARD_DELETE_CONFIRM_CODE = '0000'

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isClientHardDeleteConfirmCode(raw) {
  return String(raw ?? '').trim() === CLIENT_HARD_DELETE_CONFIRM_CODE
}
