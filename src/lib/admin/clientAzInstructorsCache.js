/**
 * Кэш client_az_instructors в IndexedDB после admin pull.
 */

import { buildPendingSyncKeysByTable, putStoreUnlessPendingSync } from '../localDb.js'
import { CLIENT_AZ_INSTRUCTORS_TABLE } from './clientAzInstructorsCore.js'

/**
 * @param {object[]|null|undefined} rows
 * @returns {Promise<number>}
 */
export async function mergeClientAzInstructorsIntoCache(rows) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return 0
  const pending = await buildPendingSyncKeysByTable()
  let n = 0
  for (const row of list) {
    if (!row?.id) continue
    await putStoreUnlessPendingSync(CLIENT_AZ_INSTRUCTORS_TABLE, row, pending)
    n += 1
  }
  return n
}
