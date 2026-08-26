/**
 * Ожидаемые сбои сессии — не шумим в console как «ошибка приложения».
 */

/**
 * @param {unknown} err
 */
export function isExpectedAuthSessionError(err) {
  const msg = String(err?.message ?? err ?? '')
  if (!msg) return false
  return /нет сессии|сессия истекла|войдите снова|выйдите и войдите/i.test(msg)
}
