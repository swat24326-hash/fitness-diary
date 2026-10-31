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
  client_az_instructors: 23,
  /** Тренировки раньше ежедневника: linked_training_id → FK. */
  trainings: 28,
  trainer_schedule_entries: 32,
  health_cards: 40,
  body_measurements: 50,
  client_weight_entries: 55,
  client_plans: 57,
  homework_auto: 58,
  health_screenings: 41,
  homework_library: 18,
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
 * Волны auto-push / push-records (параллель внутри волны ломает FK и auth «клиент есть?»).
 * Порядок: clients → прочее → trainings → слоты/вес (зависят от тренировки).
 * @param {Array<{ table_name?: string }>} items
 * @returns {Array<typeof items>}
 */
export function splitSyncPushWaves(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  if (!list.length) return []
  const table = (x) => String(x?.table_name ?? '')
  const isClients = (x) => table(x) === 'clients'
  const isTrainings = (x) => table(x) === 'trainings'
  const isAfterTrainings = (x) => {
    const t = table(x)
    return t === 'trainer_schedule_entries' || t === 'client_weight_entries'
  }
  const clients = list.filter(isClients)
  const trainings = list.filter(isTrainings)
  const afterTrainings = list.filter(isAfterTrainings)
  const mid = list.filter((x) => !isClients(x) && !isTrainings(x) && !isAfterTrainings(x))
  const waves = []
  if (clients.length) waves.push(sortSyncPushBatch(clients))
  if (mid.length) waves.push(sortSyncPushBatch(mid))
  if (trainings.length) waves.push(sortSyncPushBatch(trainings))
  if (afterTrainings.length) waves.push(sortSyncPushBatch(afterTrainings))
  return waves
}
