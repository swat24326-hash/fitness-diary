/**
 * Абонементы и тренировки клуба из IndexedDB — один проход (админ «Клиенты»).
 */
import {
  listMembershipsMapByClientIds,
  listTrainingsForClientIds,
} from '../localDbClubQuery'

/** @type {null | { key: string, memByClient: Record<string, object[]>, trainings: object[] }} */
let snapshot = null

export function invalidateAdminClubWorkspaceCache() {
  snapshot = null
}

/**
 * @param {string} clubId
 * @param {string[]} clientIds
 */
export async function loadAdminClubWorkspaceExtras(clubId, clientIds) {
  const cid = String(clubId ?? '').trim()
  const key = `${cid}:${clientIds.join(',')}`
  if (snapshot?.key === key) {
    return { memByClient: snapshot.memByClient, trainings: snapshot.trainings }
  }

  const memByClient = await listMembershipsMapByClientIds(clientIds)
  const trainings = await listTrainingsForClientIds(clientIds, { clubId: cid })

  snapshot = { key, memByClient, trainings }
  return { memByClient, trainings }
}
