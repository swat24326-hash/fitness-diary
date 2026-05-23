/**
 * Абонементы и тренировки клуба из IndexedDB — один проход (админ «Клиенты»).
 */
import { getDb } from '../localDb'

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

  const idSet = new Set(clientIds)
  const db = await getDb()
  const [allM, allT] = await Promise.all([db.getAll('memberships'), db.getAll('trainings')])

  const map = {}
  for (const m of allM ?? []) {
    if (!idSet.has(m.client_id)) continue
    if (!map[m.client_id]) map[m.client_id] = []
    map[m.client_id].push(m)
  }

  const trainings = []
  for (const t of allT ?? []) {
    if (!idSet.has(t.client_id)) continue
    if (cid && t.club_id !== cid) continue
    trainings.push(t)
  }

  snapshot = { key, memByClient: map, trainings }
  return { memByClient: map, trainings }
}
