/**
 * Один проход по IndexedDB для дашборда/списка клиентов тренера (вместо 3× getAll подряд).
 */
import { getDb } from './localDb'

const STORAGE_EVENT = 'fitness-diary-storage'

/** @type {null | { key: string, clients: object[], trainings: object[], memByClient: Record<string, object[]> }} */
let snapshot = null

let invalidateTimer = null

export function invalidateTrainerWorkspaceCache() {
  if (typeof window === 'undefined') {
    snapshot = null
    return
  }
  if (invalidateTimer) clearTimeout(invalidateTimer)
  invalidateTimer = setTimeout(() => {
    invalidateTimer = null
    snapshot = null
  }, 900)
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

/** Клуб из профиля + клубы из клиентов тренера в кэше (как collectTrainerClubIds). */
function trainerClubIds(allClients, trainerId, trainerClubId) {
  const tid = String(trainerId ?? '').trim()
  const out = new Set()
  const fromProfile = String(trainerClubId ?? '').trim()
  if (fromProfile) out.add(fromProfile)
  for (const c of allClients ?? []) {
    if (String(c.trainer_id) === tid && c.club_id) out.add(String(c.club_id))
  }
  return out
}

/**
 * @param {string} trainerId
 * @param {string | null} trainerClubId
 */
export async function loadTrainerWorkspaceSnapshot(trainerId, trainerClubId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) {
    return { clients: [], trainings: [], memByClient: {} }
  }

  const db = await getDb()
  const [allClients, allTrainings, allMemberships] = await Promise.all([
    db.getAll('clients'),
    db.getAll('trainings'),
    db.getAll('memberships'),
  ])

  const clubIds = trainerClubIds(allClients, tid, trainerClubId)
  const key = `${tid}:${[...clubIds].sort().join(',')}`
  if (snapshot?.key === key) {
    return { clients: snapshot.clients, trainings: snapshot.trainings, memByClient: snapshot.memByClient }
  }

  let clients = (allClients ?? []).filter((c) => String(c.trainer_id) === tid)
  if (clubIds.size > 0) {
    clients = clients.filter((c) => clubIds.has(String(c.club_id ?? '')))
  }

  const clientIds = clients.map((c) => c.id)
  const clientIdSet = new Set(clientIds)

  const trainings = (allTrainings ?? []).filter((t) => {
    if (String(t.trainer_id) !== tid) return false
    if (t.client_id && clientIdSet.has(t.client_id)) return true
    if (clubIds.size === 0) return true
    return clubIds.has(String(t.club_id ?? ''))
  })

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
