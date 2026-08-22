/**
 * Retention локальных тренировок (фаза 4 DATA_VOLUME).
 */

import { getDb } from './localDb.js'
import { listTrainingsByTrainerId } from './localDbClubQuery.js'
import {
  LOCAL_TRAININGS_RETENTION_DAYS,
  retentionCutoffIso,
  shouldPruneTrainingRow,
} from './idbRetentionCore.js'

export {
  LOCAL_TRAININGS_RETENTION_DAYS,
  retentionCutoffIso,
  shouldPruneTrainingRow,
  trainingDateForRetention,
} from './idbRetentionCore.js'

/**
 * Удаляет старые завершённые тренировки тренера из IDB (не трогает draft и pending sync).
 * @param {string} trainerId
 * @param {{ days?: number, pendingTrainingIds?: Set<string> }} [opts]
 */
export async function pruneLocalTrainingsForTrainer(trainerId, opts = {}) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return 0
  const cutoffIso = retentionCutoffIso(opts?.days ?? LOCAL_TRAININGS_RETENTION_DAYS)
  const pending = opts?.pendingTrainingIds ?? new Set()
  const rows = await listTrainingsByTrainerId(tid)
  const db = await getDb()
  let pruned = 0
  for (const t of rows) {
    if (!shouldPruneTrainingRow(t, cutoffIso, pending)) continue
    await db.delete('trainings', t.id)
    pruned++
  }
  return pruned
}
