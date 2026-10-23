/**
 * Смена trainer_id в push карточки клиента тренером.
 * Своего клиента можно отпустить (отказ ПНК: карточка остаётся клубу, trainer_id пустой).
 * Назначить другого тренера нельзя.
 */

/**
 * @param {object | null | undefined} payload
 * @param {string} userId
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertTrainerClientTrainerIdUpdate(payload, userId) {
  if (!payload || typeof payload !== 'object') return { ok: true }
  if (!Object.prototype.hasOwnProperty.call(payload, 'trainer_id')) return { ok: true }
  const tid = payload.trainer_id
  if (tid == null || String(tid).trim() === '') return { ok: true }
  if (String(tid) !== String(userId ?? '')) {
    return { ok: false, error: 'Нельзя переназначить клиента другому тренеру' }
  }
  return { ok: true }
}
