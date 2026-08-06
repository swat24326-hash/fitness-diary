/** Правила смены пароля и блокировки тренера (клиент + сервер). */

export const TRAINER_PASSWORD_MIN_LEN = 6

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/

/**
 * @param {string} trainerId
 */
export function parseTrainerIdForAdmin(trainerId) {
  const id = String(trainerId ?? '').trim()
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, id: null, error: 'Некорректный id тренера' }
  }
  return { ok: true, id, error: null }
}

/**
 * @param {string} password
 */
export function validateTrainerPasswordForAdmin(password) {
  const p = String(password ?? '')
  if (p.length < TRAINER_PASSWORD_MIN_LEN) {
    return { ok: false, error: `Пароль не короче ${TRAINER_PASSWORD_MIN_LEN} символов` }
  }
  return { ok: true, error: null }
}

/**
 * @param {string} password
 * @param {string} confirm
 */
export function validateTrainerPasswordConfirm(password, confirm) {
  const base = validateTrainerPasswordForAdmin(password)
  if (!base.ok) return base
  if (String(password) !== String(confirm)) {
    return { ok: false, error: 'Пароли не совпадают' }
  }
  return { ok: true, error: null }
}

/**
 * Удалять тренера можно только без клиентов (клиент + сервер).
 * @param {number} clientCount
 */
export function assertTrainerDeletableByClientCount(clientCount) {
  const n = Number(clientCount)
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  if (count > 0) {
    return {
      ok: false,
      error: `У тренера есть клиенты (${count}). Сначала переназначьте их.`,
    }
  }
  return { ok: true, error: null }
}
