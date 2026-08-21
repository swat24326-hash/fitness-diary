/**
 * Снимок рабочего места тренера из IndexedDB (индексы v9+, без getAll).
 */
import {
  listClientsByTrainerId,
  listMembershipsMapByClientIds,
  listTrainingsByTrainerId,
} from './localDbClubQuery'
import { buildLastTrainingDateByClientId, buildTrainingsByClientId } from './trainerWorkspaceIndexes'
import { getDb } from './localDb.js'
import { isTrainerPzActiveView, isTrainerPzClosedView } from './clientHallLifecycleCore.js'

const STORAGE_EVENT = 'fitness-diary-storage'

/** @type {null | { key: string, clients: object[], archivedClients: object[], trainings: object[], memByClient: Record<string, object[]>, trainingsByClientId: Record<string, object[]>, lastTrainingDateByClientId: Record<string, string> }} */
let snapshot = null

let invalidateTimer = null

/** Сброс до чтения IDB (статистика, refresh абонементов) — иначе Sync «обновил», а snapshot ещё старый. */
export function clearTrainerWorkspaceSnapshotSync() {
  if (invalidateTimer) {
    clearTimeout(invalidateTimer)
    invalidateTimer = null
  }
  snapshot = null
}

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


function trainerClubIds(clients, trainerId, trainerClubId) {
  const tid = String(trainerId ?? '').trim()
  const out = new Set()
  const fromProfile = String(trainerClubId ?? '').trim()
  if (fromProfile) out.add(fromProfile)
  for (const c of clients ?? []) {
    if (String(c.trainer_id) === tid && c.club_id) out.add(String(c.club_id))
  }
  return out
}

function clientNameSortKey(c) {
  return String(c?.name ?? '').trim().toLowerCase()
}

function sortClientsByName(list) {
  return [...(list ?? [])].sort((a, b) => clientNameSortKey(a).localeCompare(clientNameSortKey(b), 'ru'))
}

async function loadLifecycleForClients(clientIds) {
  const idSet = new Set((clientIds ?? []).map((id) => String(id)))
  try {
    const db = await getDb()
    if (!db.objectStoreNames.contains('client_hall_lifecycle')) return []
    const all = await db.getAll('client_hall_lifecycle')
    return (all ?? []).filter((r) => idSet.has(String(r?.client_id ?? '')))
  } catch {
    return []
  }
}

/**
 * @param {string} trainerId
 * @param {string | null} trainerClubId
 */
export async function loadTrainerWorkspaceSnapshot(trainerId, trainerClubId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) {
    return {
      clients: [],
      archivedClients: [],
      lifecycleRows: [],
      trainings: [],
      memByClient: {},
      trainingsByClientId: {},
      lastTrainingDateByClientId: {},
    }
  }

  const allClients = await listClientsByTrainerId(tid)
  const clubIds = trainerClubIds(allClients, tid, trainerClubId)
  const key = `${tid}:${[...clubIds].sort().join(',')}`
  if (snapshot?.key === key) {
    return {
      clients: snapshot.clients,
      archivedClients: snapshot.archivedClients ?? [],
      lifecycleRows: snapshot.lifecycleRows ?? [],
      trainings: snapshot.trainings,
      memByClient: snapshot.memByClient,
      trainingsByClientId: snapshot.trainingsByClientId,
      lastTrainingDateByClientId: snapshot.lastTrainingDateByClientId,
    }
  }

  let clientsAll = allClients
  if (clubIds.size > 0) {
    clientsAll = clientsAll.filter((c) => clubIds.has(String(c.club_id ?? '')))
  }

  const clientIds = clientsAll.map((c) => c.id)
  const lifecycleRows = await loadLifecycleForClients(clientIds)
  const memMap = await listMembershipsMapByClientIds(clientIds)

  const clubArchived = sortClientsByName(clientsAll.filter((c) => Boolean(c?.archived_at)))
  const live = clientsAll.filter((c) => !c?.archived_at)
  const activeClients = sortClientsByName(
    live.filter((c) => isTrainerPzActiveView(c, lifecycleRows, memMap[c.id] ?? memMap[String(c.id)] ?? [])),
  )
  const closedLive = live.filter((c) =>
    isTrainerPzClosedView(c, lifecycleRows, memMap[c.id] ?? memMap[String(c.id)] ?? []),
  )
  const archivedClients = sortClientsByName([...closedLive, ...clubArchived])

  const clientIdSet = new Set(clientIds)

  const trainerTrainings = await listTrainingsByTrainerId(tid)
  const trainings = trainerTrainings.filter((t) => {
    if (t.client_id && clientIdSet.has(t.client_id)) return true
    if (clubIds.size === 0) return true
    return clubIds.has(String(t.club_id ?? ''))
  })

  const memByClient = memMap
  const trainingsByClientId = buildTrainingsByClientId(trainings)
  const lastTrainingDateByClientId = buildLastTrainingDateByClientId(trainings)

  snapshot = {
    key,
    clients: activeClients,
    archivedClients,
    lifecycleRows,
    trainings,
    memByClient,
    trainingsByClientId,
    lastTrainingDateByClientId,
  }
  return {
    clients: activeClients,
    archivedClients,
    lifecycleRows,
    trainings,
    memByClient,
    trainingsByClientId,
    lastTrainingDateByClientId,
  }
}

export function initTrainerWorkspaceCacheInvalidation() {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e) => {
    const reason = e?.detail?.reason
    if (reason === 'exercises') return
    if (reason === 'client-hydrated' || reason === 'memberships-refreshed' || reason === 'sync-complete') {
      clearTrainerWorkspaceSnapshotSync()
      return
    }
    invalidateTrainerWorkspaceCache()
  }
  window.addEventListener(STORAGE_EVENT, onStorage)
  return () => window.removeEventListener(STORAGE_EVENT, onStorage)
}
