/**
 * Карта здоровья для gate «Завершить» первой тренировки.
 * Источник правды — IndexedDB; снимок экрана / session cache не подменяет свежую запись.
 */

/**
 * @param {object | null | undefined} freshHealth — из getHealthCard (IDB)
 * @param {object | null | undefined} [cachedHealth] — React state / session snapshot
 * @returns {object | null}
 */
export function resolveHealthForTrainingGate(freshHealth, cachedHealth) {
  if (freshHealth != null && typeof freshHealth === 'object') return freshHealth
  return cachedHealth ?? null
}

/**
 * Нужно ли обновить health на экране тренировки по событию локального кэша.
 * @param {unknown} detail
 * @param {string} clientId
 */
export function shouldRefreshTrainingHealthOnStorageEvent(detail, clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return false
  if (!detail || typeof detail !== 'object') return true
  const d = /** @type {Record<string, unknown>} */ (detail)
  const detailClient = String(d.client_id ?? d.clientId ?? '').trim()
  if (detailClient) return detailClient === cid
  const table = String(d.table_name ?? d.tableName ?? '').trim()
  if (table === 'health_cards') return true
  const reason = String(d.reason ?? '')
  if (reason === 'health-card-saved') return true
  if (reason === 'sync-queue' || reason === 'trainer-pull') return true
  return false
}
