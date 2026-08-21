/**
 * Кэш client_hall_lifecycle в IndexedDB после admin pull (list-memberships).
 * Без React.
 */

import { buildPendingSyncKeysByTable, putStoreUnlessPendingSync } from '../localDb.js'

/**
 * @param {object[]|null|undefined} rows
 * @returns {Promise<number>} сколько строк записали
 */
export async function mergeClientHallLifecycleIntoCache(rows) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return 0
  const pending = await buildPendingSyncKeysByTable()
  let n = 0
  for (const row of list) {
    if (!row?.id) continue
    await putStoreUnlessPendingSync('client_hall_lifecycle', row, pending)
    n += 1
  }
  return n
}
