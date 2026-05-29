/**
 * Согласование локальных тренировок клиента с облаком после pull/hydrate.
 */

import { getDb } from './localDb'
import { trainingIdsToPruneForClient } from './clientTrainingsPrune'
import { invalidateAdminClubWorkspaceCache } from './admin/adminClubWorkspaceCache'
import { invalidateTrainerWorkspaceCache } from './trainerWorkspaceCache'

export { trainingIdsToPruneForClient } from './clientTrainingsPrune'

function notifyTrainingsCachePruned(pruned) {
  if (!pruned) return
  invalidateTrainerWorkspaceCache()
  invalidateAdminClubWorkspaceCache()
}

/**
 * @param {string} clientId
 * @param {object[]} remoteTrainings — ответ сервера по этому клиенту
 * @param {Set<string>|null} [pendingTrainingIds]
 * @returns {Promise<number>} сколько записей удалено из IndexedDB
 */
export async function pruneOrphanTrainingsForClient(clientId, remoteTrainings, pendingTrainingIds = null) {
  const db = await getDb()
  const local = await db.getAll('trainings')
  const ids = trainingIdsToPruneForClient(clientId, local, remoteTrainings, pendingTrainingIds)
  for (const id of ids) {
    await db.delete('trainings', id)
  }
  notifyTrainingsCachePruned(ids.length)
  return ids.length
}

/**
 * После trainer-pull: для каждого клиента из облака убрать локальные тренировки, которых нет в pull.
 */
export async function pruneOrphanTrainingsForTrainerClients(clients, remoteTrainings, pendingTrainingIds = null) {
  const clientIds = (clients ?? [])
    .map((c) => String(c?.id ?? '').trim())
    .filter(Boolean)
  if (!clientIds.length) return 0

  const remoteByClient = new Map()
  for (const t of remoteTrainings ?? []) {
    const cid = String(t?.client_id ?? '').trim()
    if (!cid) continue
    if (!remoteByClient.has(cid)) remoteByClient.set(cid, [])
    remoteByClient.get(cid).push(t)
  }

  const db = await getDb()
  const local = await db.getAll('trainings')
  let pruned = 0
  for (const cid of clientIds) {
    const ids = trainingIdsToPruneForClient(cid, local, remoteByClient.get(cid) ?? [], pendingTrainingIds)
    for (const id of ids) {
      await db.delete('trainings', id)
      pruned++
    }
  }
  notifyTrainingsCachePruned(pruned)
  return pruned
}
