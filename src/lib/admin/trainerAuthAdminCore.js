/** Правила смены пароля, ФИО и блокировки тренера (клиент + сервер). */

import { formatClientName } from '../clientNameFormat.js'
import { normalizePasswordInput } from '../authLoginResolveCore.js'

export const TRAINER_PASSWORD_MIN_LEN = 6
export const TRAINER_NAME_MAX_LEN = 120

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
 * @returns {{ ok: true, password: string, error: null } | { ok: false, password: string, error: string }}
 */
export function validateTrainerPasswordForAdmin(password) {
  const p = normalizePasswordInput(password)
  if (p.length < TRAINER_PASSWORD_MIN_LEN) {
    return { ok: false, password: p, error: `Пароль не короче ${TRAINER_PASSWORD_MIN_LEN} символов` }
  }
  return { ok: true, password: p, error: null }
}

/**
 * @param {string} password
 * @param {string} confirm
 */
export function validateTrainerPasswordConfirm(password, confirm) {
  const base = validateTrainerPasswordForAdmin(password)
  if (!base.ok) return base
  if (base.password !== normalizePasswordInput(confirm)) {
    return { ok: false, password: base.password, error: 'Пароли не совпадают' }
  }
  return { ok: true, password: base.password, error: null }
}

/**
 * Нормализация и проверка ФИО тренера (как при создании).
 * @param {unknown} rawName
 * @returns {{ ok: true, name: string, error: null } | { ok: false, name: string, error: string }}
 */
export function validateTrainerNameForAdmin(rawName) {
  const name = formatClientName(rawName)
  if (!name) {
    return { ok: false, name: '', error: 'Укажите ФИО тренера' }
  }
  if (name.length > TRAINER_NAME_MAX_LEN) {
    return { ok: false, name: '', error: `ФИО не длиннее ${TRAINER_NAME_MAX_LEN} символов` }
  }
  return { ok: true, name, error: null }
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
