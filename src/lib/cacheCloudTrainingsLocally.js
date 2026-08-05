/**
 * Запись строк журнала/облака в локальный кэш планшета (без затирания pending).
 */

import { buildPendingSyncKeysByTable, putStoreUnlessPendingSync } from './localDb.js'
import { markRecordFromCloud } from './syncLocalRecords.js'
import { invalidateTrainerWorkspaceCache } from './trainerWorkspaceCache.js'

/**
 * @param {object[]|null|undefined} trainings
 * @returns {Promise<number>} сколько попыток записи
 */
export async function cacheCloudTrainingsLocally(trainings) {
  const rows = (trainings ?? []).filter((t) => String(t?.id ?? '').trim())
  if (!rows.length) return 0
  const pending = await buildPendingSyncKeysByTable()
  for (const t of rows) {
    await putStoreUnlessPendingSync('trainings', markRecordFromCloud(t), pending)
  }
  invalidateTrainerWorkspaceCache()
  return rows.length
}
