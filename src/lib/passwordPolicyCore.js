/** Политика нового пароля сотрудника (клиент + сервер). Старые пароли при входе не проверяются. */

export const PASSWORD_MIN_LEN = 8

export const PASSWORD_TOO_SHORT_RU = `Пароль не короче ${PASSWORD_MIN_LEN} символов`

/**
 * @param {unknown} password уже нормализованный пароль
 * @returns {string | null} текст ошибки или null
 */
export function newPasswordError(password) {
  return String(password ?? '').length < PASSWORD_MIN_LEN ? PASSWORD_TOO_SHORT_RU : null
}
