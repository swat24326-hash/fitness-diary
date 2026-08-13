/**
 * Каскад club_id абонов/тренировок после переезда клиента в другой клуб.
 */

import { saveLocalWithSync } from '../syncService.js'
import { listTrainingsByClientId } from '../localDbClubQuery.js'
import { planClientClubMoveRelatedPatches } from './clientTrainerReassignCore.js'

/**
 * @param {{
 *   clientId: string,
 *   oldClubId?: string|null,
 *   nextClubId?: string|null,
 *   memberships?: object[],
 * }} opts
 * @returns {Promise<{ membershipsUpdated: number, trainingsUpdated: number }>}
 */
export async function cascadeClientClubMoveLocal({
  clientId,
  oldClubId,
  nextClubId,
  memberships = [],
} = {}) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return { membershipsUpdated: 0, trainingsUpdated: 0 }

  const trainings = await listTrainingsByClientId(cid)
  const patches = planClientClubMoveRelatedPatches({
    memberships,
    trainings,
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

  return {
    membershipsUpdated: patches.memberships.length,
    trainingsUpdated: patches.trainings.length,
  }
}
