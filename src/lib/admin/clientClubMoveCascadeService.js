/**
 * Каскад club_id абонов/тренировок/жизненного цикла залов после переезда клиента в другой клуб.
 */

import { saveLocalWithSync } from '../syncService.js'
import { listClientHallLifecycleByClientId, listTrainingsByClientId } from '../localDbClubQuery.js'
import { CLIENT_HALL_LIFECYCLE_TABLE } from '../clientHallLifecycleCore.js'
import { planClientClubMoveRelatedPatches } from './clientTrainerReassignCore.js'

/**
 * @param {{
 *   clientId: string,
 *   oldClubId?: string|null,
 *   nextClubId?: string|null,
 *   memberships?: object[],
 * }} opts
 * @returns {Promise<{ membershipsUpdated: number, trainingsUpdated: number, lifecycleUpdated: number }>}
 */
export async function cascadeClientClubMoveLocal({
  clientId,
  oldClubId,
  nextClubId,
  memberships = [],
} = {}) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return { membershipsUpdated: 0, trainingsUpdated: 0, lifecycleUpdated: 0 }

  const trainings = await listTrainingsByClientId(cid)
  const lifecycleRows = await listClientHallLifecycleByClientId(cid)
  const patches = planClientClubMoveRelatedPatches({
    memberships,
    trainings,
    lifecycleRows,
    oldClubId,
    nextClubId,
  })

  for (const m of patches.memberships) {
    await saveLocalWithSync('memberships', m, {
      table_name: 'memberships',
      operation: 'update',
      remote_id: m.id,
    })
  }
  for (const t of patches.trainings) {
    await saveLocalWithSync('trainings', t, {
      table_name: 'trainings',
      operation: 'update',
      remote_id: t.id,
    })
  }
  for (const row of patches.lifecycle) {
    await saveLocalWithSync('client_hall_lifecycle', row, {
      table_name: CLIENT_HALL_LIFECYCLE_TABLE,
      operation: 'update',
      remote_id: row.id,
    })
  }

  return {
    membershipsUpdated: patches.memberships.length,
    trainingsUpdated: patches.trainings.length,
    lifecycleUpdated: patches.lifecycle.length,
  }
}
