/**
 * Один проход по IndexedDB для дашборда/списка клиентов тренера (вместо 3× getAll подряд).
 */
import { getDb } from './localDb'

const STORAGE_EVENT = 'fitness-diary-storage'

/** @type {null | { key: string, clients: object[], trainings: object[], memByClient: Record<string, object[]> }} */
let snapshot = null

export function invalidateTrainerWorkspaceCache() {
  snapshot = null
}

function buildMemMap(memberships, clientIds) {
  const ids = new Set(clientIds)
  const map = {}
  for (const m of memberships ?? []) {
    const cid = m.client_id
    if (!cid || !ids.has(cid)) continue
    if (!map[cid]) map[cid] = []
    map[cid].push(m)
  }
  return map
}

/**
 * @param {string} trainerId
 * @param {string | null} trainerClubId
 */
export async function loadTrainerWorkspaceSnapshot(trainerId, trainerClubId) {
  const tid = String(trainerId ?? '').trim()
  const cid = String(trainerClubId ?? '').trim()
  const key = `${tid}:${cid}`
  if (snapshot?.key === key) {
    return { clients: snapshot.clients, trainings: snapshot.trainings, memByClient: snapshot.memByClient }
  }
  if (!tid || !cid) {
    return { clients: [], trainings: [], memByClient: {} }
  }

  const db = await getDb()
  const [allClients, allTrainings, allMemberships] = await Promise.all([
    db.getAll('clients'),
    db.getAll('trainings'),
    db.getAll('memberships'),
  ])

  const clients = (allClients ?? []).filter((c) => c.trainer_id === tid && c.club_id === cid)
  const clientIds = clients.map((c) => c.id)
  const trainings = (allTrainings ?? []).filter((t) => t.trainer_id === tid && t.club_id === cid)
  const memByClient = buildMemMap(allMemberships, clientIds)

  snapshot = { key, clients, trainings, memByClient }
  return { clients, trainings, memByClient }
}

export function initTrainerWorkspaceCacheInvalidation() {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e) => {
    const reason = e?.detail?.reason
    if (reason === 'exercises') return
    invalidateTrainerWorkspaceCache()
  }
  window.addEventListener(STORAGE_EVENT, onStorage)
  return () => window.removeEventListener(STORAGE_EVENT, onStorage)
}
