import { isSupabaseConfigured } from './supabase'
import { buildPendingSyncKeysByTable, getDb, putStoreUnlessPendingSync } from './localDb'
import {
  listChallengesByClubId,
  listClientsByClubId,
  listClientsByTrainerId,
  listTrainingsByClubIdInRange,
} from './localDbClubQuery'
import { mergeChallengeLists, sortChallengesByCreatedDesc } from './challengesClubQuery'
import { todayLocalIso } from './dateRu'
import { isAppOnline, saveLocalWithSync, deleteLocalWithSync } from './syncService'
import { pushRecordViaApi } from './syncApiClient'
import { fetchChallengeTrainingsViaApi, fetchTrainersViaAdminApi } from './admin/adminApiClient'
import {
  CHALLENGE_METRICS,
  CHALLENGE_REF_WEIGHT_TOLERANCE_KG,
  buildChallengeLeaderboard,
  bestMaxRepsFromSets,
  normExerciseName,
  normalizeChallengeReferenceWeight,
  parseReferenceWeightKg,
  weightMatchesReferenceKg,
} from './challengeLeaderboardCore'

export {
  CHALLENGE_METRICS,
  CHALLENGE_REF_WEIGHT_TOLERANCE_KG,
  buildChallengeLeaderboard,
  bestMaxRepsFromSets,
  normExerciseName,
  normalizeChallengeReferenceWeight,
  parseReferenceWeightKg,
  weightMatchesReferenceKg,
}

export function formatChallengeMetricRu(metric, referenceWeightKg = null) {
  if (metric === 'max_reps') {
    const ref = parseReferenceWeightKg(referenceWeightKg)
    if (ref != null) return `Макс. повторения @ ${ref} кг`
    return 'Макс. повторения'
  }
  if (metric === 'max_time_sec') return 'Макс. время (сек.)'
  if (metric === 'max_distance_m') return 'Макс. расстояние (м)'
  if (metric === 'max_points') return 'Максимум (устар.)'
  if (metric === 'max_rpe') return 'Макс. RPE (устар.)'
  return 'Макс. вес'
}

/** Подпись метрики из строки челленджа. */
export function formatChallengeMetricLabel(challenge) {
  return formatChallengeMetricRu(challenge?.metric, challenge?.reference_weight_kg)
}

export function formatChallengeValueRu(metric, value) {
  if (value == null || !Number.isFinite(value)) return '—'
  if (metric === 'max_weight') return `${Math.round(value * 10) / 10} кг`
  if (metric === 'max_reps') return `${Math.round(value)} повт.`
  if (metric === 'max_time_sec') return `${Math.round(value * 10) / 10} с`
  if (metric === 'max_distance_m') return `${Math.round(value * 10) / 10} м`
  if (metric === 'max_points') return `${Math.round(value * 10) / 10}`
  if (metric === 'max_rpe') return `${Math.round(value * 10) / 10}`
  return String(value)
}

export function isChallengeActiveByCalendar(ch) {
  if (!ch || !isChallengeStatusActive(ch)) return false
  const today = todayLocalIso()
  const a = String(ch.start_date ?? '').slice(0, 10)
  const b = String(ch.end_date ?? '').slice(0, 10)
  if (!a || !b) return false
  return today >= a && today <= b
}

function isChallengeStatusActive(ch) {
  const st = String(ch?.status ?? '').trim().toLowerCase()
  return st === 'active' || st === 'активен'
}

/** Для главной тренера: челлендж ещё не закончился (можно показать до старта периода). */
export function isChallengeVisibleForTrainerHome(ch) {
  if (!ch || !isChallengeStatusActive(ch)) return false
  const today = todayLocalIso()
  const b = String(ch.end_date ?? '').slice(0, 10)
  return !!b && today <= b
}

/** Кэш имён тренеров на сессию — не дергать /api/list-trainers на каждый челлендж. */
let trainerNameMapCache = null
let trainerNameMapCacheAt = 0
const TRAINER_NAME_MAP_TTL_MS = 5 * 60 * 1000

async function buildTrainerNameMap() {
  if (trainerNameMapCache && Date.now() - trainerNameMapCacheAt < TRAINER_NAME_MAP_TTL_MS) {
    return trainerNameMapCache
  }
  const map = new Map()
  try {
    const viaApi = await fetchTrainersViaAdminApi()
    for (const u of viaApi?.trainers ?? []) {
      if (u?.id) map.set(u.id, String(u.name ?? '').trim() || '—')
    }
  } catch {
    /* офлайн — имена в рейтинге необязательны */
  }
  trainerNameMapCache = map
  trainerNameMapCacheAt = Date.now()
  return map
}

function notifyLocalDataChanged() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('fitness-diary-storage', { detail: { reason: 'challenge-trainings' } }))
  } catch {
    /* ignore */
  }
}

/** Подтянуть тренировки клуба за период челленджа (Vercel API → IndexedDB). */
export async function pullChallengeTrainingsForPeriod(clubId, dateFrom, dateTo, opts = {}) {
  const cid = String(clubId ?? '').trim()
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!cid || !from || !to || !isSupabaseConfigured()) return { ok: false, reason: 'no_params' }

  try {
    const viaApi = await fetchChallengeTrainingsViaApi(cid, from, to)
    if (viaApi) {
      const pending = await buildPendingSyncKeysByTable()
      for (const row of viaApi.trainings) {
        await putStoreUnlessPendingSync('trainings', row, pending)
      }
      if (opts.notify !== false) notifyLocalDataChanged()
      return { ok: true, count: viaApi.trainings.length, source: 'api' }
    }
  } catch (e) {
    const msg = String(e?.message ?? e ?? '')
    if (!/failed to fetch|connection reset|timeout/i.test(msg)) {
      return { ok: false, error: msg }
    }
  }

  return { ok: false, error: 'Нет связи с сервером' }
}

/** Мин/макс даты по списку челленджей (YYYY-MM-DD). */
export function challengePeriodBounds(challenges) {
  let from = ''
  let to = ''
  for (const ch of challenges ?? []) {
    const a = String(ch.start_date ?? '').slice(0, 10)
    const b = String(ch.end_date ?? '').slice(0, 10)
    if (a && (!from || a < from)) from = a
    if (b && (!to || b > to)) to = b
  }
  return { from, to }
}

/** Один pull тренировок клуба на весь диапазон челленджей (для списка админа). */
export async function pullChallengeTrainingsForClubChallenges(clubId, challenges, opts = {}) {
  const cid = String(clubId ?? '').trim()
  const { from, to } = challengePeriodBounds(challenges)
  if (!cid || !from || !to) return { ok: false, reason: 'no_dates' }
  return pullChallengeTrainingsForPeriod(cid, from, to, { notify: opts.notify ?? false })
}

/** Клуб тренера: из профиля или из его клиентов в кэше. */
export async function resolveTrainerClubId(trainerId, profileClubId) {
  const ids = await collectTrainerClubIds(trainerId, profileClubId)
  return ids[0] ?? ''
}

/** Все клубы, где у тренера есть клиенты (и клуб из профиля). */
export async function collectTrainerClubIds(trainerId, profileClubId) {
  const out = new Set()
  const fromProfile = String(profileClubId ?? '').trim()
  if (fromProfile) out.add(fromProfile)
  const tid = String(trainerId ?? '').trim()
  if (!tid) return [...out]
  const clients = await listClientsByTrainerId(tid)
  for (const c of clients ?? []) {
    if (c.club_id) out.add(String(c.club_id))
  }
  return [...out]
}

/**
 * Челленджи для тренера: pull по каждому клубу из клиентов, список из IndexedDB.
 */
export async function listChallengesForTrainer(trainerId, profileClubId, { pullRemote = true } = {}) {
  const clubIds = await collectTrainerClubIds(trainerId, profileClubId)
  if (!clubIds.length) return { challenges: [], pull: null, clubIds: [] }

  let pull = null
  if (pullRemote && isSupabaseConfigured() && isAppOnline()) {
    for (const cid of clubIds) {
      pull = await pullChallengesForClub(cid)
    }
  }

  const lists = await Promise.all(clubIds.map((cid) => listChallengesByClubId(cid)))
  const challenges = mergeChallengeLists(lists)

  return { challenges, pull, clubIds }
}

/**
 * @param {string} clubId
 * @param {{ challenge?: object, pullRemote?: boolean }} [opts]
 */
export async function loadContextForChallengeLeaderboard(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  const ch = opts.challenge
  let dateFrom = ''
  let dateTo = ''
  if (ch && opts.pullRemote !== false && cid && isSupabaseConfigured() && isAppOnline()) {
    dateFrom = String(ch.start_date ?? '').slice(0, 10)
    dateTo = String(ch.end_date ?? '').slice(0, 10)
    if (dateFrom && dateTo) {
      try {
        await pullChallengeTrainingsForPeriod(cid, dateFrom, dateTo, { notify: opts.notifyPull !== false })
      } catch (e) {
        console.warn('[challenge] pull trainings', e)
      }
    }
  }

  const clubClients = await listClientsByClubId(cid)
  const from = dateFrom || String(ch?.start_date ?? '').slice(0, 10)
  const to = dateTo || String(ch?.end_date ?? '').slice(0, 10)
  const clubTrainings =
    from && to ? await listTrainingsByClubIdInRange(cid, from, to) : []
  const { listExercisesCached } = await import('./exerciseCatalog')
  const exercises = await listExercisesCached()
  const trainerNameById = await buildTrainerNameMap()
  return { trainings: clubTrainings, clients: clubClients, exercises: exercises ?? [], trainerNameById }
}

export async function getChallengeByIdLocal(id) {
  if (!id) return null
  const db = await getDb()
  return db.get('challenges', id)
}

export async function listChallengesLocalForClub(clubId) {
  if (!clubId) return []
  const rows = await listChallengesByClubId(clubId)
  return sortChallengesByCreatedDesc(rows)
}

export async function pullChallengesForClub(clubId) {
  const { pullChallengesForClubFromCloud } = await import('./pullReferenceData')
  return pullChallengesForClubFromCloud(clubId)
}

export async function listChallengesForClub(clubId, { pullRemote = true } = {}) {
  if (!clubId) return { challenges: [], pull: null }
  let pull = null
  if (pullRemote && isSupabaseConfigured() && isAppOnline()) {
    pull = await pullChallengesForClub(clubId)
  }
  const challenges = await listChallengesLocalForClub(clubId)
  return { challenges, pull }
}

/**
 * @returns {Promise<{ cloudOk: boolean, cloudError?: string }>}
 */
export async function saveNewChallenge(row) {
  const payload = { ...row, created_by: row.created_by ?? null }
  const local_id = await saveLocalWithSync('challenges', payload, {
    table_name: 'challenges',
    operation: 'insert',
    remote_id: null,
  })
  if (!isSupabaseConfigured() || !isAppOnline()) {
    return { cloudOk: false, cloudError: 'Нет сети — челлендж только на этом устройстве. Нажмите Sync позже.' }
  }
  const push = await pushRecordViaApi({
    table_name: 'challenges',
    operation: 'insert',
    data: payload,
    remote_id: null,
    local_id,
  })
  return push.ok ? { cloudOk: true } : { cloudOk: false, cloudError: push.error ?? 'Не удалось отправить в облако' }
}

/** Повторная отправка челленджа в Supabase (если остался только в IndexedDB). */
export async function pushChallengeToCloud(row) {
  if (!row?.id) return { cloudOk: false, cloudError: 'Нет id челленджа' }
  const payload = { ...row, created_by: row.created_by ?? null }
  const { listSyncQueue } = await import('./localDb')
  let local_id = null
  for (const item of await listSyncQueue()) {
    if (item.table_name !== 'challenges') continue
    if (String(item.data?.id ?? item.remote_id ?? '') !== String(row.id)) continue
    local_id = item.local_id
    break
  }
  const push = await pushRecordViaApi({
    table_name: 'challenges',
    operation: 'insert',
    data: payload,
    remote_id: null,
    local_id,
  })
  return push.ok ? { cloudOk: true } : { cloudOk: false, cloudError: push.error }
}

export async function updateChallengeRecord(row) {
  await saveLocalWithSync('challenges', row, {
    table_name: 'challenges',
    operation: 'update',
    remote_id: row.id,
  })
}

export async function deleteChallengeById(id) {
  if (!id) return
  await deleteLocalWithSync('challenges', id, 'challenges')
}

export function validateChallengeDraft(d) {
  const name = String(d.name ?? '').trim()
  if (!name) return { ok: false, message: 'Укажите название' }
  if (!d.club_id) return { ok: false, message: 'Выберите клуб' }
  if (!d.exercise_id) return { ok: false, message: 'Выберите упражнение' }
  if (!CHALLENGE_METRICS.includes(d.metric)) return { ok: false, message: 'Некорректный показатель' }
  if (d.metric !== 'max_reps' && d.reference_weight_kg != null) {
    return { ok: false, message: 'Вес зачёта только для «Макс. повторения»' }
  }
  if (d.metric === 'max_reps' && d.reference_weight_kg != null && parseReferenceWeightKg(d.reference_weight_kg) == null) {
    return { ok: false, message: 'Укажите вес для зачёта (кг) или снимите галочку' }
  }
  const a = String(d.start_date ?? '').slice(0, 10)
  const b = String(d.end_date ?? '').slice(0, 10)
  if (!a || !b) return { ok: false, message: 'Укажите период' }
  if (b < a) return { ok: false, message: 'Дата окончания раньше начала' }
  const desc = String(d.description ?? '').trim()
  if (desc.length > 4000) return { ok: false, message: 'Описание не длиннее 4000 символов' }
  return { ok: true }
}
