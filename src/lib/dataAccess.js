import { supabase } from './supabase'
import { isSupabaseConfigured } from './supabase'
import { withSupabaseRetry } from './supabaseRetry'
import {
  getDb,
  listSyncQueue,
  putStore,
  removeSyncItem,
} from './localDb'
import {
  listClientsByTrainerId,
  listMeasurementsByClientId,
  listMembershipsByClientId,
  listTrainingsByClientId,
  listTrainingsByTrainerId,
} from './localDbClubQuery'
import {
  deleteHealthCardByClientId,
  deleteLocalWithSync,
  saveLocalWithSync,
} from './syncService'
import { ADMIN_CLIENT_COUNT_BATCH } from './admin/adminConstants'
import { fetchTrainersViaAdminApi } from './admin/adminApiClient'
import { dispatchLocalDataChanged } from './localDataEvents'

export { loadAdminJournalPage } from './admin/adminJournalService'
export { loadClubTrainingStats } from './admin/adminClubStatsService'
export {
  listTrainersWithClubForAdmin,
  updateTrainerClubForAdmin,
  countClientsByTrainer,
  deleteTrainerForAdmin,
} from './admin/adminOrganizationService'
export { listAdminClientsForClub } from './admin/adminClientsListService'
export {
  searchAdminClientsForJournal,
  clearAdminClientSearchLocalCache,
  clearAdminClientSearchLocalCache as clearAdminClientsBriefCache,
} from './admin/adminClientSearchService'
export { loadAdminHealthCardsByClientIds } from './admin/adminHealthCardService'
export { hydrateAdminClientWorkspace } from './admin/adminClientHydrate'
export {
  listClubsLocal,
  resolveClubDisplayName,
  pullClientsForClub,
  reconcileClubSaveForAdmin,
  reconcileClubDeleteForAdmin,
  saveClubForAdmin,
  pullClubsFromSupabase,
  removeClubFromLocalCache,
  getClubDeletionBlockers,
  deleteClubForAdmin,
} from './admin/adminClubsService'
export { LOCAL_DATA_CHANGED, dispatchLocalDataChanged } from './localDataEvents'

export {
  CHALLENGE_METRICS,
  formatChallengeMetricRu,
  formatChallengeMetricLabel,
  formatChallengeValueRu,
  parseReferenceWeightKg,
  normalizeChallengeReferenceWeight,
  isChallengeActiveByCalendar,
  isChallengeVisibleForTrainerHome,
  buildChallengeLeaderboard,
  loadContextForChallengeLeaderboard,
  pullChallengeTrainingsForPeriod,
  pullChallengeTrainingsForClubChallenges,
  challengePeriodBounds,
  resolveTrainerClubId,
  collectTrainerClubIds,
  listChallengesForTrainer,
  getChallengeByIdLocal,
  listChallengesForClub,
  pullChallengesForClub,
  saveNewChallenge,
  pushChallengeToCloud,
  updateChallengeRecord,
  deleteChallengeById,
  validateChallengeDraft,
} from './challengeService'

import { pullTrainerWorkspaceFromCloud as pullTrainerWorkspace } from './trainerPullService'

export { pullTrainerWorkspaceFromCloud } from './trainerPullService'

/** @deprecated Используйте pullTrainerWorkspaceFromCloud */
export async function pullClientsForTrainer(trainerId) {
  return pullTrainerWorkspace(trainerId)
}

/**
 * Клиенты тренера.
 * `trainerClubId` обязателен: без привязки тренера к клубу ничего не показываем.
 */
export async function listLocalClients(trainerId, trainerClubId = null) {
  const tid = String(trainerClubId ?? '').trim()
  if (!tid) return []
  return (await listClientsByTrainerId(trainerId)).filter((c) => c.club_id === tid)
}

export async function getLocalClient(id) {
  const db = await getDb()
  return db.get('clients', id)
}

export async function listMemberships(clientId) {
  return listMembershipsByClientId(clientId)
}

/**
 * Тренировки тренера; при заданном `trainerClubId` — только по этому клубу.
 */
export async function listTrainingsForTrainer(trainerId, trainerClubId = null) {
  const cid = String(trainerClubId ?? '').trim()
  if (!cid) return []
  return (await listTrainingsByTrainerId(trainerId)).filter((t) => t.club_id === cid)
}

export async function listExercises() {
  const { listExercisesCached } = await import('./exerciseCatalog')
  return listExercisesCached()
}

export async function listMeasurements(clientId) {
  return listMeasurementsByClientId(clientId)
}

export async function getHealthCard(clientId) {
  const db = await getDb()
  return db.get('health_cards', clientId)
}

export async function upsertExercise(exercise) {
  await putStore('exercises', exercise)
  const { invalidateExerciseCatalogCache } = await import('./exerciseCatalog')
  invalidateExerciseCatalogCache()
}

export async function listAllTrainings() {
  const db = await getDb()
  return db.getAll('trainings')
}

/**
 * Сколько клиентов у каждого тренера: из Supabase, если доступно иначе из IndexedDB на устройстве.
 * @param {{ skipRemote?: boolean }} [opts] — не ходить в Supabase (например список тренеров уже с сервера Vercel).
 */
export async function getClientCountsByTrainerId(opts = {}) {
  async function fromLocal() {
    const counts = {}
    const db = await getDb()
    const all = await db.getAll('clients')
    for (const c of all) {
      if (c.trainer_id) counts[c.trainer_id] = (counts[c.trainer_id] ?? 0) + 1
    }
    return { counts, source: 'local' }
  }
  if (!isSupabaseConfigured() || opts.skipRemote === true) return fromLocal()
  try {
    const counts = {}
    let from = 0
    for (;;) {
      const { data, error } = await withSupabaseRetry(() =>
        supabase
          .from('clients')
          .select('trainer_id')
          .order('id', { ascending: true })
          .range(from, from + ADMIN_CLIENT_COUNT_BATCH - 1),
      )
      if (error) throw error
      const rows = data ?? []
      if (!rows.length) break
      for (const row of rows) {
        const tid = row.trainer_id
        if (tid) counts[tid] = (counts[tid] ?? 0) + 1
      }
      if (rows.length < ADMIN_CLIENT_COUNT_BATCH) break
      from += ADMIN_CLIENT_COUNT_BATCH
    }
    return { counts, source: 'remote' }
  } catch {
    return fromLocal()
  }
}

function readAdminTrainersSessionCache() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem('fit-admin-trainers-cache')
    if (!raw) return null
    const cached = JSON.parse(raw)
    return Array.isArray(cached) ? cached : null
  } catch {
    return null
  }
}

function mapTrainerSummaries(rows) {
  return (rows ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    club_id: u.club_id ?? null,
  }))
}

/** Список тренеров для админки — через /api/list-trainers, без прямых запросов в Supabase из браузера. */
export async function listTrainerSummariesForAdmin() {
  if (!isSupabaseConfigured()) return []
  try {
    const viaApi = await fetchTrainersViaAdminApi()
    if (viaApi) {
      return mapTrainerSummaries(viaApi.trainers)
    }
  } catch {
    /* ниже — кэш с прошлой успешной загрузки */
  }
  const cached = readAdminTrainersSessionCache()
  if (cached?.length) return mapTrainerSummaries(cached)
  return []
}

/** @param {{ force?: boolean }} [opts] — force: явное «Обновить» в админке */
export async function pullExercisesFromSupabase(opts = {}) {
  const { pullExercisesFromCloud } = await import('./exerciseCatalog')
  return pullExercisesFromCloud(opts)
}

export { ensureExercisesCached, markExercisesSyncMetaDirty, invalidateExerciseCatalogCache } from './exerciseCatalog'

export { insertExercise, updateExercise, removeExercise } from './exerciseService'

export async function listTrainingsForClient(clientId) {
  return listTrainingsByClientId(clientId)
}

/**
 * После смены клуба у тренера — привести club_id у его клиентов, их абонементов и тренировок к новому клубу (локально + sync).
 */
export async function updateAllLocalClientsClubForTrainer(trainerId, newClubId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return
  const raw = newClubId != null ? String(newClubId).trim() : ''
  const nextClub = raw || null
  const trainerClients = await listClientsByTrainerId(tid)
  const clientIds = new Set(trainerClients.map((c) => c.id))

  for (const c of trainerClients) {
    if (c.club_id === nextClub) continue
    const next = { ...c, club_id: nextClub }
    await saveLocalWithSync('clients', next, { table_name: 'clients', operation: 'update', remote_id: c.id })
  }

  for (const clientId of clientIds) {
    for (const m of await listMembershipsByClientId(clientId)) {
      if (m.club_id === nextClub) continue
      const next = { ...m, club_id: nextClub }
      await saveLocalWithSync('memberships', next, { table_name: 'memberships', operation: 'update', remote_id: m.id })
    }
    for (const t of await listTrainingsByClientId(clientId)) {
      if (t.club_id === nextClub) continue
      const next = { ...t, club_id: nextClub }
      await saveLocalWithSync('trainings', next, { table_name: 'trainings', operation: 'update', remote_id: t.id })
    }
  }

  dispatchLocalDataChanged({ reason: 'trainer-club-cascade', trainerId: tid })
}

/**
 * Убирает из очереди устаревшие insert/update по клиенту (после каскада delete остаются только delete).
 */
async function purgeSyncQueuePendingForClient({
  clientId,
  trainingIds,
  membershipIds,
  measurementIds,
  healthCardRemoteId,
}) {
  const queue = await listSyncQueue()
  const tid = new Set(trainingIds)
  const mid = new Set(membershipIds)
  const bid = new Set(measurementIds)

  for (const item of queue) {
    const op = item.operation
    if (op !== 'insert' && op !== 'update') continue

    const tbl = item.table_name
    const rid = item.remote_id
    const d = item.data && typeof item.data === 'object' ? item.data : {}
    let drop = false

    if (tbl === 'clients' && (rid === clientId || d.id === clientId)) drop = true
    if (tbl === 'trainings' && (d.client_id === clientId || tid.has(rid))) drop = true
    if (tbl === 'memberships' && (d.client_id === clientId || mid.has(rid))) drop = true
    if (tbl === 'body_measurements' && (d.client_id === clientId || bid.has(rid))) drop = true
    if (tbl === 'health_cards') {
      if (d.client_id === clientId) drop = true
      if (healthCardRemoteId != null && rid === healthCardRemoteId) drop = true
    }

    if (drop) await removeSyncItem(item.local_id)
  }
}

/**
 * Удаляет клиента и все связанные локальные данные (тренировки, абонементы, замеры, медкарта),
 * ставит операции delete в очередь синхронизации.
 */
export async function deleteClientAndAllData(clientId) {
  const hc = await getHealthCard(clientId)
  const healthCardRemoteId = hc?.id ?? null

  const trainings = await listTrainingsByClientId(clientId)
  const trainingIds = trainings.map((t) => t.id)
  for (const t of trainings) {
    await deleteLocalWithSync('trainings', t.id, 'trainings')
  }

  const mems = await listMembershipsByClientId(clientId)
  const membershipIds = mems.map((m) => m.id)
  for (const m of mems) {
    await deleteLocalWithSync('memberships', m.id, 'memberships')
  }

  const measures = await listMeasurementsByClientId(clientId)
  const measurementIds = measures.map((b) => b.id)
  for (const b of measures) {
    await deleteLocalWithSync('body_measurements', b.id, 'body_measurements')
  }

  await deleteHealthCardByClientId(clientId)

  await deleteLocalWithSync('clients', clientId, 'clients')

  await purgeSyncQueuePendingForClient({
    clientId,
    trainingIds,
    membershipIds,
    measurementIds,
    healthCardRemoteId,
  })

  dispatchLocalDataChanged({ reason: 'client-deleted', clientId })
}
