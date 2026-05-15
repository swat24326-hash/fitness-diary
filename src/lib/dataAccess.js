import { supabase } from './supabase'
import { isSupabaseConfigured } from './supabase'
import { getDb, listSyncQueue, putStore, removeSyncItem } from './localDb'
import { deleteHealthCardByClientId, deleteLocalWithSync, saveLocalWithSync } from './syncService'
import { DEMO_SEED_CLIENT_ID, DEMO_SEED_MEMBERSHIP_ID, DEMO_SEED_TRAINING_ID } from './seedDemo'
import { ADMIN_CLIENT_COUNT_BATCH, ADMIN_SYNC_BATCH_SIZE } from './admin/adminConstants'

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
  CHALLENGE_METRICS,
  formatChallengeMetricRu,
  formatChallengeValueRu,
  isChallengeActiveByCalendar,
  buildChallengeLeaderboard,
  loadContextForChallengeLeaderboard,
  getChallengeByIdLocal,
  listChallengesForClub,
  pullChallengesForClub,
  saveNewChallenge,
  updateChallengeRecord,
  deleteChallengeById,
  validateChallengeDraft,
} from './challengeService'

export async function pullClientsForTrainer(trainerId) {
  if (!isSupabaseConfigured() || !trainerId) return
  const { data, error } = await supabase.from('clients').select('*').eq('trainer_id', trainerId)
  if (error || !data) return
  const db = await getDb()
  const tx = db.transaction('clients', 'readwrite')
  for (const row of data) {
    await tx.store.put(row)
  }
  await tx.done
}

/**
 * Клиенты тренера.
 * `trainerClubId` обязателен: без привязки тренера к клубу ничего не показываем.
 */
export async function listLocalClients(trainerId, trainerClubId = null) {
  const db = await getDb()
  const all = await db.getAll('clients')
  const tid = String(trainerClubId ?? '').trim()
  if (!tid) return []
  return all.filter((c) => {
    if (c.trainer_id !== trainerId) return false
    return c.club_id === tid
  })
}

export async function getLocalClient(id) {
  const db = await getDb()
  return db.get('clients', id)
}

export async function listMemberships(clientId) {
  const db = await getDb()
  const all = await db.getAll('memberships')
  return all.filter((m) => m.client_id === clientId)
}

/**
 * Тренировки тренера; при заданном `trainerClubId` — только по этому клубу.
 */
export async function listTrainingsForTrainer(trainerId, trainerClubId = null) {
  const db = await getDb()
  const all = await db.getAll('trainings')
  const cid = String(trainerClubId ?? '').trim()
  if (!cid) return []
  return all.filter((t) => {
    if (t.trainer_id !== trainerId) return false
    return t.club_id === cid
  })
}

export async function listExercises() {
  const db = await getDb()
  return db.getAll('exercises')
}

export async function listMeasurements(clientId) {
  const db = await getDb()
  const all = await db.getAll('body_measurements')
  return all.filter((m) => m.client_id === clientId).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

export async function getHealthCard(clientId) {
  const db = await getDb()
  return db.get('health_cards', clientId)
}

export async function upsertExercise(exercise) {
  await putStore('exercises', exercise)
}

export async function listClubsLocal() {
  const db = await getDb()
  return db.getAll('clubs')
}

export async function listAllTrainings() {
  const db = await getDb()
  return db.getAll('trainings')
}

/**
 * Сколько клиентов у каждого тренера: из Supabase, если доступно иначе из IndexedDB на устройстве.
 */
export async function getClientCountsByTrainerId() {
  async function fromLocal() {
    const db = await getDb()
    const all = await db.getAll('clients')
    const counts = {}
    for (const c of all) {
      if (c.trainer_id) counts[c.trainer_id] = (counts[c.trainer_id] ?? 0) + 1
    }
    return { counts, source: 'local' }
  }
  if (!isSupabaseConfigured()) return fromLocal()
  try {
    const counts = {}
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('clients')
        .select('trainer_id')
        .order('id', { ascending: true })
        .range(from, from + ADMIN_CLIENT_COUNT_BATCH - 1)
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

/** Список тренеров для админки (имя + id + club_id при наличии колонки). Пусто без Supabase или при ошибке. */
export async function listTrainerSummariesForAdmin() {
  if (!isSupabaseConfigured()) return []
  try {
    const { data, error } = await supabase.from('users').select('id, name, club_id').eq('role', 'trainer').order('name')
    if (error) {
      const m = String(error.message ?? '').toLowerCase()
      if (m.includes('club_id')) {
        const { data: d2, error: e2 } = await supabase.from('users').select('id, name').eq('role', 'trainer').order('name')
        if (e2) throw e2
        return (d2 ?? []).map((u) => ({ ...u, club_id: null }))
      }
      throw error
    }
    return data ?? []
  } catch {
    return []
  }
}

/** Подтянуть справочник упражнений из Supabase в локальный IndexedDB. */
export async function pullExercisesFromSupabase() {
  if (!isSupabaseConfigured()) return { ok: false, reason: 'no_supabase' }
  try {
    let total = 0
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1)
      if (error) throw error
      const rows = data ?? []
      if (!rows.length) break
      for (const row of rows) {
        await putStore('exercises', row)
      }
      total += rows.length
      if (rows.length < ADMIN_SYNC_BATCH_SIZE) break
      from += ADMIN_SYNC_BATCH_SIZE
    }
    return { ok: true, count: total }
  } catch (e) {
    return { ok: false, error: e?.message ?? 'Ошибка загрузки упражнений' }
  }
}

/** Подтянуть клубы из Supabase в локальный IndexedDB. */
export async function pullClubsFromSupabase() {
  if (!isSupabaseConfigured()) return { ok: false, reason: 'no_supabase' }
  try {
    let total = 0
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1)
      if (error) throw error
      const rows = data ?? []
      if (!rows.length) break
      for (const row of rows) {
        await putStore('clubs', row)
      }
      total += rows.length
      if (rows.length < ADMIN_SYNC_BATCH_SIZE) break
      from += ADMIN_SYNC_BATCH_SIZE
    }
    return { ok: true, count: total }
  } catch (e) {
    return { ok: false, error: e?.message ?? 'Ошибка загрузки клубов' }
  }
}

export async function listTrainingsForClient(clientId) {
  const db = await getDb()
  const all = await db.getAll('trainings')
  return all.filter((t) => t.client_id === clientId)
}

/** Имя события: локальные данные изменились (удаление клиента и т.п.). */
export const LOCAL_DATA_CHANGED = 'fitness-diary-storage'

export function dispatchLocalDataChanged(detail = {}) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_DATA_CHANGED, { detail }))
  } catch {
    /* ignore */
  }
}

/** Проверка: можно ли удалить клуб (есть ли привязанные сущности). */
export async function getClubDeletionBlockers(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) {
    return { blocked: true, clients: 0, trainers: 0, memberships: 0, trainings: 0, reason: 'empty_id' }
  }
  const db = await getDb()
  const clients = (await db.getAll('clients')).filter(
    (c) => String(c.club_id) === cid && String(c.id) !== DEMO_SEED_CLIENT_ID,
  ).length
  const memberships = (await db.getAll('memberships')).filter(
    (m) => String(m.club_id) === cid && String(m.id) !== DEMO_SEED_MEMBERSHIP_ID && String(m.client_id) !== DEMO_SEED_CLIENT_ID,
  ).length
  const trainings = (await db.getAll('trainings')).filter(
    (t) => String(t.club_id) === cid && String(t.id) !== DEMO_SEED_TRAINING_ID && String(t.client_id) !== DEMO_SEED_CLIENT_ID,
  ).length
  let trainers = 0
  if (isSupabaseConfigured()) {
    try {
      const { count, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'trainer')
        .eq('club_id', cid)
      if (!error && typeof count === 'number') trainers = count
    } catch {
      trainers = 0
    }
  }
  const blocked = clients > 0 || trainers > 0 || memberships > 0 || trainings > 0
  return { blocked, clients, trainers, memberships, trainings }
}

/** Удаление клуба из локального кэша и постановка delete в очередь синхронизации. */
export async function deleteClubForAdmin(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) throw new Error('Не указан клуб')
  const st = await getClubDeletionBlockers(cid)
  if (st.blocked) {
    throw new Error(
      `Клуб нельзя удалить: клиентов ${st.clients}, тренеров ${st.trainers}, абонементов по клубу ${st.memberships}, тренировок ${st.trainings}. Освободите привязки и повторите.`,
    )
  }
  await deleteLocalWithSync('clubs', cid, 'clubs')
  dispatchLocalDataChanged({ reason: 'club-deleted', clubId: cid })
}

/**
 * После смены клуба у тренера — привести club_id у его клиентов, их абонементов и тренировок к новому клубу (локально + sync).
 */
export async function updateAllLocalClientsClubForTrainer(trainerId, newClubId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return
  const raw = newClubId != null ? String(newClubId).trim() : ''
  const nextClub = raw || null
  const db = await getDb()
  const all = await db.getAll('clients')
  const clientIds = new Set()
  for (const c of all) {
    if (c.trainer_id !== tid) continue
    clientIds.add(c.id)
  }

  for (const c of all) {
    if (c.trainer_id !== tid) continue
    if (c.club_id === nextClub) continue
    const next = { ...c, club_id: nextClub }
    await saveLocalWithSync('clients', next, { table_name: 'clients', operation: 'update', remote_id: c.id })
  }

  const allM = await db.getAll('memberships')
  for (const m of allM) {
    if (!clientIds.has(m.client_id)) continue
    if (m.club_id === nextClub) continue
    const next = { ...m, club_id: nextClub }
    await saveLocalWithSync('memberships', next, { table_name: 'memberships', operation: 'update', remote_id: m.id })
  }

  const allT = await db.getAll('trainings')
  for (const t of allT) {
    if (!clientIds.has(t.client_id)) continue
    if (t.club_id === nextClub) continue
    const next = { ...t, club_id: nextClub }
    await saveLocalWithSync('trainings', next, { table_name: 'trainings', operation: 'update', remote_id: t.id })
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
  const db = await getDb()
  const hc = await getHealthCard(clientId)
  const healthCardRemoteId = hc?.id ?? null

  const trainings = (await db.getAll('trainings')).filter((t) => t.client_id === clientId)
  const trainingIds = trainings.map((t) => t.id)
  for (const t of trainings) {
    await deleteLocalWithSync('trainings', t.id, 'trainings')
  }

  const mems = (await db.getAll('memberships')).filter((m) => m.client_id === clientId)
  const membershipIds = mems.map((m) => m.id)
  for (const m of mems) {
    await deleteLocalWithSync('memberships', m.id, 'memberships')
  }

  const measures = (await db.getAll('body_measurements')).filter((b) => b.client_id === clientId)
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
