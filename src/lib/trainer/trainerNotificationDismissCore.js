/**
 * Локальное «скрыл / понял» для pending во Входящих «От клиентов».
 * Пока клиент не открыл план — строка иначе висит вечно и краснеет бейдж.
 */

export function isTrainerPendingNotificationKind(kind) {
  const k = String(kind ?? '')
  return k === 'nutrition_pending' || k === 'homework_pending'
}

/**
 * Убрать из ленты pending, которые тренер уже скрыл (по id плана).
 * «Клиент открыл» не трогаем — даже если раньше скрывали ожидание того же id.
 * @param {object[]} items
 * @param {Record<string, string>|Map<string, string>|null|undefined} dismissedById
 */
export function applyTrainerNotificationDismissals(items, dismissedById) {
  if (!dismissedById) return items ?? []
  const has =
    dismissedById instanceof Map
      ? (id) => dismissedById.has(String(id))
      : (id) => Object.prototype.hasOwnProperty.call(dismissedById, String(id))
  return (items ?? []).filter((it) => {
    if (!isTrainerPendingNotificationKind(it?.kind)) return true
    return !has(it.id)
  })
}

/**
 * @param {Record<string, string>} map
 * @param {string} planId
 * @param {string} [atIso]
 */
export function withTrainerPendingDismissal(map, planId, atIso = new Date().toISOString()) {
  const id = String(planId ?? '').trim()
  if (!id) return { ...(map ?? {}) }
  return { ...(map ?? {}), [id]: String(atIso) }
}
