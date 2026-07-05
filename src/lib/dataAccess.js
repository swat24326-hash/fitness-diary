import { supabase } from './supabase'
import { USERS_TRAINER_ROLES } from './userRoleConstants'
import { isSupabaseConfigured } from './supabase'
import {
  assertSupabaseOk,
  humanizeNetworkError,
  isRetryableNetworkError,
  sleep,
  withFastTimeout,
  withSupabaseRetry,
} from './supabaseRetry'
import {
  buildPendingSyncKeysByTable,
  getDb,
  listSyncQueue,
  putStore,
  putStoreUnlessPendingSync,
  removeSyncItem,
} from './localDb'
import {
  deleteHealthCardByClientId,
  deleteLocalWithSync,
  isDuplicateInsertError,
  saveLocalWithSync,
} from './syncService'
import { DEMO_SEED_CLIENT_ID, DEMO_SEED_MEMBERSHIP_ID, DEMO_SEED_TRAINING_ID } from './seedDemo'
import { ADMIN_CLIENT_COUNT_BATCH, ADMIN_SYNC_BATCH_SIZE } from './admin/adminConstants'
import { fetchClubsViaAdminApi, fetchTrainersViaAdminApi } from './admin/adminApiClient'
import { firstSuccessfulPromise, isCloudReachable } from './networkReachability'

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
  const { listExercisesCached } = await import('./exerciseCatalog')
  return listExercisesCached()
}

export async function listMeasurements(clientId) {
  const db = await getDb()
  const all = await db.getAll('body_measurements')
  const cid = String(clientId ?? '')
  return all.filter((m) => String(m.client_id ?? '') === cid).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
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

export async function listClubsLocal() {
  const db = await getDb()
  const all = await db.getAll('clubs')
  const byId = new Map()
  for (const c of all) {
    const id = String(c?.id ?? '')
    if (id) byId.set(id, c)
  }
  return [...byId.values()]
}

const CLUB_REMOTE_MS = 7000
const CLUB_VERIFY_MS = 4000

/** Название клуба для UI (кэш → один запрос в Supabase). Тренеру не нужен полный pullClubs. */
export async function resolveClubDisplayName(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return '—'
  const local = (await listClubsLocal()).find((c) => String(c.id) === cid)
  const localName = local?.name?.trim()
  if (localName) return localName
  if (!isSupabaseConfigured()) return cid
  try {
    const res = await withFastTimeout(
      supabase.from('clubs').select('*').eq('id', cid).maybeSingle(),
      CLUB_VERIFY_MS,
    )
    if (!res.error && res.data?.name) {
      await putStore('clubs', res.data)
      clubsPulledAt = 0
      return String(res.data.name).trim()
    }
  } catch {
    /* сеть — покажем id */
  }
  return cid
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
    const db = await getDb()
    const all = await db.getAll('clients')
    const counts = {}
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

/** Подтянуть клиентов клуба из Supabase в IndexedDB. */
export async function pullClientsForClub(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!isSupabaseConfigured() || !cid) return { ok: false, reason: 'no_club' }
  try {
    let total = 0
    let from = 0
    for (;;) {
      const { data, error } = await withSupabaseRetry(() =>
        supabase
          .from('clients')
          .select('*')
          .eq('club_id', cid)
          .order('name', { ascending: true })
          .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1),
      )
      if (error) throw error
      const rows = data ?? []
      if (!rows.length) break
      const pending = await buildPendingSyncKeysByTable()
      for (const row of rows) {
        await putStoreUnlessPendingSync('clients', row, pending)
      }
      total += rows.length
      if (rows.length < ADMIN_SYNC_BATCH_SIZE) break
      from += ADMIN_SYNC_BATCH_SIZE
    }
    dispatchLocalDataChanged()
    return { ok: true, count: total }
  } catch (e) {
    return { ok: false, error: e?.message ?? 'Ошибка загрузки клиентов' }
  }
}

let clubsPulledAt = 0
let clubsPullInFlight = null
const CLUBS_PULL_TTL_MS = 45_000

async function pendingClubInsertIds() {
  const queue = await listSyncQueue()
  const ids = new Set()
  for (const item of queue) {
    if (item.table_name === 'clubs' && item.operation === 'insert' && item.data?.id) {
      ids.add(String(item.data.id))
    }
  }
  return ids
}

async function clearClubSyncQueueForId(clubId) {
  const cid = String(clubId)
  for (const item of await listSyncQueue()) {
    if (item.table_name === 'clubs' && String(item.remote_id ?? item.data?.id) === cid) {
      await removeSyncItem(item.local_id)
    }
  }
}

async function clubExistsInSupabase(clubId, timeoutMs = CLUB_VERIFY_MS) {
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured()) return false
  try {
    const res = await withFastTimeout(supabase.from('clubs').select('id').eq('id', cid).maybeSingle(), timeoutMs)
    assertSupabaseOk(res)
    return !!res.data?.id
  } catch {
    return false
  }
}

/** Несколько коротких проверок — insert мог пройти, а ответ оборвался (CONNECTION_RESET). */
async function verifyClubInSupabaseWithRetry(clubId, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    if (await clubExistsInSupabase(clubId)) return true
    if (i < attempts - 1) await sleep(800)
  }
  return false
}

/** Клуб точно удалён в облаке — только при успешном SELECT без строки (ошибка сети ≠ удалён). */
async function verifyClubAbsentFromSupabase(clubId, attempts = 5) {
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured()) return false
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await withFastTimeout(supabase.from('clubs').select('id').eq('id', cid).maybeSingle(), CLUB_VERIFY_MS)
      assertSupabaseOk(res)
      if (!res.data) return true
    } catch {
      /* сеть — не считаем удалённым */
    }
    if (i < attempts - 1) await sleep(800)
  }
  return false
}

async function runClubRemoteOnce(fn, timeoutMs = CLUB_REMOTE_MS) {
  return withFastTimeout(fn(), timeoutMs)
}

/** Два шанса на insert/update (пауза между ними), без длинной цепочки retry. */
/**
 * @param {() => Promise<unknown>} fn
 * @param {{ skipSecondAttemptIf?: () => Promise<boolean> }} [opts]
 */
async function runClubRemoteTwice(fn, opts = {}) {
  try {
    return await runClubRemoteOnce(fn)
  } catch (e1) {
    if (opts.skipSecondAttemptIf && (await opts.skipSecondAttemptIf())) {
      return null
    }
    if (!isRetryableNetworkError(e1) && !/timeout/i.test(String(e1?.message ?? ''))) throw e1
    if (opts.skipSecondAttemptIf && (await opts.skipSecondAttemptIf())) {
      return null
    }
    await sleep(700)
    return await runClubRemoteOnce(fn)
  }
}

async function finishClubRemoteSuccess(row, cid, persistLocal) {
  await persistLocal()
  await clearClubSyncQueueForId(cid)
  return { remoteOk: true }
}

/** После сохранения клуба: если в UI «ошибка», но строка уже в Supabase — считать успехом. */
export async function reconcileClubSaveForAdmin(clubId, result) {
  if (result?.remoteOk) return result
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured()) return result
  if (await verifyClubInSupabaseWithRetry(cid, 8)) {
    return { remoteOk: true, recoveredAfterNetwork: true }
  }
  return result
}

/** После удаления: если в UI «ошибка», но в Supabase клуба уже нет — считать успехом. */
export async function reconcileClubDeleteForAdmin(clubId, result) {
  if (result?.remoteOk) return result
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured()) return result
  if (await verifyClubAbsentFromSupabase(cid, 6)) {
    return { remoteOk: true, alreadyGoneRemote: true }
  }
  return result
}

/**
 * Создание/обновление клуба админом: сначала Supabase, затем IndexedDB.
 * @returns {Promise<{ remoteOk: boolean, recoveredAfterNetwork?: boolean }>}
 */
export async function saveClubForAdmin(row, { isNew = false } = {}) {
  const cid = String(row?.id ?? '').trim()
  if (!cid) throw new Error('Не указан id клуба')

  if (!isSupabaseConfigured()) {
    await putStore('clubs', row)
    clubsPulledAt = 0
    dispatchLocalDataChanged()
    return { remoteOk: true }
  }

  const persistLocal = async () => {
    await putStore('clubs', row)
    clubsPulledAt = 0
    dispatchLocalDataChanged()
  }

  const runRemote = async () => {
    if (isNew) {
      const res = await supabase.from('clubs').insert(row).select().single()
      if (!res.error && res.data) return res
      if (res.error && (res.error.status === 409 || res.error.code === '23505')) {
        if (await clubExistsInSupabase(cid)) return { data: { id: cid }, error: null }
      }
      assertSupabaseOk(res)
      return res
    }
    const res = await supabase.from('clubs').update(row).eq('id', cid).select().single()
    assertSupabaseOk(res)
    if (!res.data) {
      throw new Error('Клуб не найден в Supabase — обновите список (↻).')
    }
    return res
  }

  const skipDuplicateInsert = async () => isNew && (await clubExistsInSupabase(cid))

  try {
    if (isNew) {
      try {
        await runClubRemoteOnce(() => runRemote())
      } catch (insertErr) {
        if (await verifyClubInSupabaseWithRetry(cid, 8)) {
          return finishClubRemoteSuccess(row, cid, persistLocal)
        }
        throw insertErr
      }
    } else {
      await runClubRemoteTwice(() => runRemote(), { skipSecondAttemptIf: skipDuplicateInsert })
    }
    return finishClubRemoteSuccess(row, cid, persistLocal)
  } catch (e) {
    const msg = String(e?.message ?? '')
    const status = Number(e?.status ?? 0)
    if (
      status === 409 ||
      isDuplicateInsertError(e) ||
      /duplicate key|unique constraint|23505|409/i.test(msg)
    ) {
      if (await verifyClubInSupabaseWithRetry(cid, 3)) {
        return { ...(await finishClubRemoteSuccess(row, cid, persistLocal)), recoveredAfterNetwork: true }
      }
    }
    if (
      status === 403 ||
      status === 401 ||
      /403|forbidden|permission denied|permission|policy|42501|row-level security/i.test(msg)
    ) {
      throw new Error(
        'Supabase отклонил запись (403): RLS не считает вас админом. В SQL Editor выполните миграцию 20260519120000_fit_auth_admin_by_email.sql или: UPDATE public.users SET id = (SELECT auth.uid()) WHERE email ILIKE \'admin@fit-city.ru\'; UID — в Authentication → Users.',
      )
    }
    if (isRetryableNetworkError(e) || /timeout|failed to fetch/i.test(msg)) {
      if (await verifyClubInSupabaseWithRetry(cid, 6)) {
        return { ...(await finishClubRemoteSuccess(row, cid, persistLocal)), recoveredAfterNetwork: true }
      }
      await putStore('clubs', row)
      clubsPulledAt = 0
      dispatchLocalDataChanged()
      if (await verifyClubInSupabaseWithRetry(cid, 8)) {
        return { ...(await finishClubRemoteSuccess(row, cid, persistLocal)), recoveredAfterNetwork: true }
      }
      return { remoteOk: false }
    }
    throw new Error(humanizeNetworkError(e))
  }
}

/** Подтянуть клубы из Supabase в локальный IndexedDB. */
export async function pullClubsFromSupabase(opts = {}) {
  if (!isSupabaseConfigured()) return { ok: false, reason: 'no_supabase' }
  const force = opts.force === true
  if (!force && Date.now() - clubsPulledAt < CLUBS_PULL_TTL_MS) {
    return { ok: true, count: 0, cached: true }
  }
  if (!force && clubsPullInFlight) return clubsPullInFlight
  clubsPullInFlight = pullClubsFromSupabaseInner().finally(() => {
    clubsPullInFlight = null
  })
  return clubsPullInFlight
}

async function mergeClubsIntoLocalCache(rows) {
  const remoteIds = new Set()
  const list = Array.isArray(rows) ? rows : []
  for (const row of list) {
    remoteIds.add(String(row.id))
    await putStore('clubs', row)
  }
  let pruned = 0
  /* Не удаляем весь локальный кэш при пустом ответе (обрыв/сбой может выглядеть как 0 строк). */
  if (remoteIds.size > 0) {
    const keepLocal = await pendingClubInsertIds()
    const db = await getDb()
    for (const c of await db.getAll('clubs')) {
      const id = String(c.id)
      if (!remoteIds.has(id) && !keepLocal.has(id)) {
        await db.delete('clubs', id)
        pruned++
      }
    }
  }
  dispatchLocalDataChanged()
  clubsPulledAt = Date.now()
  return { ok: true, count: list.length, pruned }
}

async function pullClubsFromSupabaseInner() {
  const mergeFromApi = async () => {
    const viaApi = await fetchClubsViaAdminApi()
    if (!viaApi) throw new Error('api_unavailable')
    return { ...(await mergeClubsIntoLocalCache(viaApi.clubs)), source: 'admin_api' }
  }

  const mergeFromDirect = async () => {
    const res = await runClubRemoteOnce(() =>
      supabase.from('clubs').select('*').order('id', { ascending: true }),
    )
    if (res.error) throw res.error
    return { ...(await mergeClubsIntoLocalCache(res.data ?? [])), source: 'supabase' }
  }

  const fallbackLocal = async (e) => {
    const cached = await listClubsLocal().catch(() => [])
    if (Array.isArray(cached) && cached.length > 0) {
      return { ok: true, count: cached.length, cached: true, source: 'local', warn: e?.message ?? 'api_unavailable' }
    }
    return { ok: false, error: e?.message ?? 'Ошибка загрузки клубов' }
  }

  try {
    if (!isCloudReachable()) {
      return await mergeFromDirect()
    }
    return await firstSuccessfulPromise([mergeFromApi, mergeFromDirect])
  } catch (e) {
    try {
      return await mergeFromDirect()
    } catch (directErr) {
      return fallbackLocal(directErr ?? e)
    }
  }
}

/** Убрать клуб только из IndexedDB (уже удалён в Supabase или нет сети). */
export async function removeClubFromLocalCache(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return
  const db = await getDb()
  await db.delete('clubs', cid)
  const queue = await listSyncQueue()
  for (const item of queue) {
    if (item.table_name === 'clubs' && String(item.remote_id) === cid) {
      await removeSyncItem(item.local_id)
    }
  }
  clubsPulledAt = 0
  dispatchLocalDataChanged({ reason: 'club-deleted', clubId: cid })
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
  let remoteClients = 0
  let remoteTrainings = 0
  const localBlocked = clients > 0 || memberships > 0 || trainings > 0
  if (isSupabaseConfigured() && !localBlocked) {
    try {
      const res = await withFastTimeout(
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .in('role', USERS_TRAINER_ROLES)
          .eq('club_id', cid),
        3000,
      )
      trainers = typeof res.count === 'number' ? res.count : 0
    } catch {
      trainers = 0
    }
  } else if (isSupabaseConfigured() && localBlocked) {
    const remoteCount = async (table, extraFilter) => {
      try {
        let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('club_id', cid)
        if (extraFilter) q = extraFilter(q)
        const res = await withFastTimeout(q, 3000)
        return typeof res.count === 'number' ? res.count : 0
      } catch {
        return 0
      }
    }
    trainers = await remoteCount('users', (q) => q.in('role', USERS_TRAINER_ROLES))
    remoteClients = await remoteCount('clients')
    remoteTrainings = await remoteCount('trainings')
  }
  const totalClients = Math.max(clients, remoteClients)
  const totalTrainings = Math.max(trainings, remoteTrainings)
  const blocked = totalClients > 0 || trainers > 0 || memberships > 0 || totalTrainings > 0
  return {
    blocked,
    clients: totalClients,
    trainers,
    memberships,
    trainings: totalTrainings,
    remoteChecked: isSupabaseConfigured(),
  }
}

/**
 * Удаление клуба: сразу из IndexedDB (список обновляется), затем DELETE в Supabase (короткий таймаут).
 * @returns {Promise<{ remoteOk: boolean }>}
 */
export async function deleteClubForAdmin(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) throw new Error('Не указан клуб')
  const st = await getClubDeletionBlockers(cid)
  if (st.blocked) {
    throw new Error(
      `Клуб нельзя удалить: клиентов ${st.clients}, тренеров ${st.trainers}, абонементов по клубу ${st.memberships}, тренировок ${st.trainings}. Освободите привязки и повторите.`,
    )
  }

  if (!isSupabaseConfigured()) {
    const db = await getDb()
    await db.delete('clubs', cid)
    clubsPulledAt = 0
    dispatchLocalDataChanged({ reason: 'club-deleted', clubId: cid })
    return { remoteOk: true, alreadyGoneRemote: false }
  }

  const runDeleteRemote = async () => {
    const res = await supabase.from('clubs').delete().eq('id', cid).select('id')
    assertSupabaseOk(res)
    if (res.data?.length) return res
    if (await verifyClubAbsentFromSupabase(cid, 2)) {
      return res
    }
    throw new Error(
      'Клуб не удалён в Supabase (0 строк). Проверьте RLS и что users.id совпадает с Auth UID.',
    )
  }

  let remoteOk = false
  let alreadyGoneRemote = false
  const skipSecondDelete = async () => verifyClubAbsentFromSupabase(cid, 2)

  try {
    await runClubRemoteTwice(() => runDeleteRemote(), { skipSecondAttemptIf: skipSecondDelete })
    remoteOk = true
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (/foreign key|violates|23503/i.test(msg)) {
      throw new Error('Клуб связан с данными в облаке (клиенты, челленджи, тренировки). Сначала удалите или перенесите их.')
    }
    if (/permission|policy|42501|row-level security|0 строк/i.test(msg)) {
      throw new Error(
        msg.includes('0 строк')
          ? msg
          : 'Нет прав на удаление в Supabase. Проверьте RLS (20260518120000_clubs_rls_admin.sql) и users.id = Auth UID.',
      )
    }
    if (isRetryableNetworkError(e) || /timeout|failed to fetch/i.test(msg)) {
      if (await verifyClubAbsentFromSupabase(cid)) {
        remoteOk = true
        alreadyGoneRemote = true
      } else if (await verifyClubAbsentFromSupabase(cid, 6)) {
        remoteOk = true
        alreadyGoneRemote = true
      } else {
        return { remoteOk: false, alreadyGoneRemote: false }
      }
    } else {
      throw new Error(humanizeNetworkError(e))
    }
  }

  const db = await getDb()
  await db.delete('clubs', cid)
  const queue = await listSyncQueue()
  for (const item of queue) {
    if (item.table_name === 'clubs' && String(item.remote_id) === cid) {
      await removeSyncItem(item.local_id)
    }
  }
  clubsPulledAt = 0
  dispatchLocalDataChanged({ reason: 'club-deleted', clubId: cid })
  return { remoteOk, alreadyGoneRemote }
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
