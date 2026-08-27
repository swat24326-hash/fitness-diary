/**
 * Порядок отправки sync_queue / auto-push: сначала сущности, от которых зависят остальные.
 * Чистый модуль — verify без React/IDB.
 */

export const SYNC_TABLE_PRIORITY = Object.freeze({
  clients: 10,
  pnk_funnel_events: 12,
  sale_clips: 13,
  membership_types: 15,
  nutrition_products: 16,
  homework_presets: 17,
  memberships: 20,
  client_hall_lifecycle: 22,
  /** Тренировки раньше ежедневника: linked_training_id → FK. */
  trainings: 28,
  trainer_schedule_entries: 32,
  health_cards: 40,
  body_measurements: 50,
  client_weight_entries: 55,
  challenges: 60,
  exercises: 70,
})

/**
 * @param {{ table_name?: string, operation?: string }} item
 */
export function syncQueueSortKey(item) {
  const op = item?.operation
  const opRank = op === 'delete' ? 0 : op === 'insert' ? 1 : 2
  const tableRank = SYNC_TABLE_PRIORITY[item?.table_name] ?? 99
  return opRank * 1000 + tableRank
}

/**
 * @param {Array<{ table_name?: string, operation?: string }>} items
 */
export function sortSyncPushBatch(items) {
  const list = Array.isArray(items) ? [...items] : []
  list.sort((a, b) => syncQueueSortKey(a) - syncQueueSortKey(b))
  return list
}

/**
 * Волны auto-push: сначала trainings, потом остальное (параллельный push-records не ломает FK).
 * @param {Array<{ table_name?: string }>} items
 * @returns {Array<typeof items>}
 */
export function splitSyncPushWaves(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  if (!list.length) return []
  const trainings = list.filter((x) => String(x.table_name ?? '') === 'trainings')
  const rest = list.filter((x) => String(x.table_name ?? '') !== 'trainings')
  const waves = []
  if (trainings.length) waves.push(sortSyncPushBatch(trainings))
  if (rest.length) waves.push(sortSyncPushBatch(rest))
  return waves
}
