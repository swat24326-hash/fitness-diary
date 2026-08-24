/**
 * Загрузка плитки «Трен.» для формы: memberships + дневник → buildTrainingMembershipTileSummary.
 */

import { listMemberships, listTrainingsForClient } from '../dataAccess.js'
import { getDb } from '../localDb.js'
import { buildTrainingMembershipTileSummary } from './trainingMembershipTileCore.js'

/**
 * @param {{
 *   clientId?: string | null,
 *   trainingId?: string | null,
 *   training?: object | null,
 *   trainingDate?: string | null,
 *   status?: string | null,
 *   memberships?: object[],
 *   allTrainings?: object[],
 *   fallbackDate?: string | null,
 * }} opts
 */
export async function loadTrainingMembershipTileSummary(opts = {}) {
  const clientId = String(opts.clientId ?? '').trim()
  if (!clientId) return null

  const memberships =
    Array.isArray(opts.memberships) ? opts.memberships : await listMemberships(clientId)
  const allTrainings =
    Array.isArray(opts.allTrainings) ? opts.allTrainings : await listTrainingsForClient(clientId)

  let training = opts.training && typeof opts.training === 'object' ? opts.training : null
  const tid = String(opts.trainingId ?? training?.id ?? '').trim()
  if (!training && tid && tid !== 'new') {
    training = allTrainings.find((t) => String(t?.id) === tid) ?? null
    if (!training) {
      try {
        const db = await getDb()
        const row = await db.get('trainings', tid)
        if (row && typeof row === 'object') training = row
      } catch {
        /* ignore */
      }
    }
  }

  return buildTrainingMembershipTileSummary({
    memberships,
    allTrainings,
    training,
    trainingDate: opts.trainingDate,
    status: opts.status,
    fallbackDate: opts.fallbackDate,
  })
}
