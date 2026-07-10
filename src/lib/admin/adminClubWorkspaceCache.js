/**
 * Абонементы и тренировки клуба из IndexedDB (админ «Клиенты»).
 */
import {
  buildMembershipsMapByClubId,
  listTrainingsForClientIds,
} from '../localDbClubQuery'

/** @type {null | { key: string, memByClient: Record<string, object[]>, trainings: object[] }} */
let snapshot = null

export function invalidateAdminClubWorkspaceCache() {
  snapshot = null
}

/** Абонементы клуба одним проходом по индексу club_id. */
export async function loadAdminClubMembershipsMap(clubId) {
  return buildMembershipsMapByClubId(clubId)
}

/** Тренировки только для указанных client_id (страница списка). */
export async function loadAdminClubTrainingsForClientIds(clubId, clientIds) {
  const cid = String(clubId ?? '').trim()
  return listTrainingsForClientIds(clientIds, { clubId: cid })
}

/**
 * @param {string} clubId
 * @param {string[]} clientIds
 * @deprecated Предпочитайте loadAdminClubMembershipsMap + loadAdminClubTrainingsForClientIds
 */
export async function loadAdminClubWorkspaceExtras(clubId, clientIds) {
  const cid = String(clubId ?? '').trim()
  const key = `${cid}:${clientIds.join(',')}`
  if (snapshot?.key === key) {
    return { memByClient: snapshot.memByClient, trainings: snapshot.trainings }
  }

  const memByClient = await loadAdminClubMembershipsMap(cid)
  const trainings = await loadAdminClubTrainingsForClientIds(cid, clientIds)

  snapshot = { key, memByClient, trainings }
  return { memByClient, trainings }
}
