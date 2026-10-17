/**
 * Локальное «прочитано» у тренера для ленты «От клиентов».
 * Не удаляем строку: событие остаётся в истории, без красной точки и без бейджа.
 */

export function isTrainerPendingNotificationKind(kind) {
  const k = String(kind ?? '')
  return k === 'nutrition_pending' || k === 'homework_pending'
}

function lookupAt(map, id) {
  if (!map) return null
  const key = String(id)
  if (map instanceof Map) return map.has(key) ? String(map.get(key)) : null
  if (!Object.prototype.hasOwnProperty.call(map, key)) return null
  return String(map[key])
}

/**
 * Тренер прочитал уведомление на устройстве → ставим read_at, строка остаётся.
 * @param {object[]} items
 * @param {Record<string, string>|Map<string, string>|null|undefined} trainerReadById
 */
export function applyTrainerNotificationDismissals(items, trainerReadById) {
  return (items ?? []).map((it) => {
    if (!it?.id) return it
    const at = lookupAt(trainerReadById, it.id)
    if (!at) return it
    if (it.read_at) return it
    return { ...it, read_at: at }
  })
}

/** @deprecated имя оставлено для store; то же что mark-read */
export function withTrainerPendingDismissal(map, planId, atIso = new Date().toISOString()) {
  const id = String(planId ?? '').trim()
  if (!id) return { ...(map ?? {}) }
  return { ...(map ?? {}), [id]: String(atIso) }
}
