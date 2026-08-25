/**
 * После PWA reload: дописать в IDB черновики из durable, если они новее.
 * Нет строки в IDB — создать draft (иначе вкладки пустые после auto-update).
 */

import { getDb, listSyncQueue } from './localDb.js'
import { saveLocalWithSync } from './syncService.js'
import {
  collectPendingTrainingDeleteIds,
  shouldSkipDurableHydrateForTraining,
} from './trainingDraftCleanupCore.js'
import { shouldPreferDurableDraftOverIdb } from './trainingDraftDurableCore.js'
import { listTrainingDraftDurables } from './trainingDraftDurableStorage.js'

let hydrateInFlight = null

/**
 * @returns {Promise<{ restored: number }>}
 */
export async function hydrateTrainingDraftsFromDurable() {
  if (hydrateInFlight) return hydrateInFlight
  hydrateInFlight = (async () => {
    let restored = 0
    const snaps = listTrainingDraftDurables()
    if (!snaps.length) return { restored: 0 }
    const pendingDeleteIds = collectPendingTrainingDeleteIds(await listSyncQueue())
    const db = await getDb()
    for (const durable of snaps) {
      const tid = String(durable?.trainingId ?? '').trim()
      const cid = String(durable?.clientId ?? '').trim()
      if (!tid || !cid) continue
      if (shouldSkipDurableHydrateForTraining(pendingDeleteIds, tid)) continue
      if (String(durable.status ?? 'draft') === 'completed') continue
      try {
        const idbRow = await db.get('trainings', tid)
        if (
          !shouldPreferDurableDraftOverIdb({
            idbRow,
            durable,
            expectClientId: cid,
            expectTrainingId: tid,
          })
        ) {
          continue
        }
        const workout =
          durable.workoutState && typeof durable.workoutState === 'object' ? durable.workoutState : {}
        const revisedAt = String(durable.revisedAt || new Date().toISOString())
        const date =
          String(durable.trainingDate || idbRow?.date || '').slice(0, 10) ||
          revisedAt.slice(0, 10)
        if (idbRow && typeof idbRow === 'object') {
          const row = {
            ...idbRow,
            id: tid,
            client_id: cid,
            date,
            type: durable.trainingType || idbRow.type || 'Силовая',
            status: 'draft',
            data: workout,
            synced: false,
          }
          await saveLocalWithSync('trainings', row, {
            table_name: 'trainings',
            operation: 'update',
            remote_id: tid,
          })
        } else {
          const trainerId = String(durable.trainerId ?? '').trim()
          if (!trainerId) continue
          const clubId = String(durable.clubId ?? '').trim() || null
          const row = {
            id: tid,
            client_id: cid,
            trainer_id: trainerId,
            club_id: clubId,
            date,
            type: durable.trainingType || 'Силовая',
            status: 'draft',
            data: workout,
            created_at: revisedAt,
            updated_at: revisedAt,
            synced: false,
          }
          await saveLocalWithSync('trainings', row, {
            table_name: 'trainings',
            operation: 'insert',
            remote_id: null,
          })
        }
        restored += 1
      } catch {
        /* best-effort */
      }
    }
    return { restored }
  })()
  try {
    return await hydrateInFlight
  } finally {
    hydrateInFlight = null
  }
}
