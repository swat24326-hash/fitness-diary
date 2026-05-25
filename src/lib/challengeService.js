import { isSupabaseConfigured } from './supabase'
import { getDb, getAllStore, putStore } from './localDb'
import { todayLocalIso } from './dateRu'
import { isAppOnline, saveLocalWithSync, deleteLocalWithSync } from './syncService'
import { pushRecordViaApi } from './syncApiClient'
import { fetchChallengeTrainingsViaApi, fetchTrainersViaAdminApi } from './admin/adminApiClient'

/** Допустимые метрики при создании/редактировании челленджа */
export const CHALLENGE_METRICS = ['max_weight', 'max_reps', 'max_time_sec', 'max_distance_m']

/** Устаревшие значения в старых данных — рейтинг считаем, в форме не предлагаем */
const LEGACY_METRICS = ['max_rpe', 'max_points']

function isKnownChallengeMetric(metric) {
  return CHALLENGE_METRICS.includes(metric) || LEGACY_METRICS.includes(metric)
}

export function formatChallengeMetricRu(metric) {
  if (metric === 'max_reps') return 'Макс. повторения'
  if (metric === 'max_time_sec') return 'Макс. время (сек.)'
  if (metric === 'max_distance_m') return 'Макс. расстояние (м)'
  if (metric === 'max_points') return 'Максимум (устар.)'
  if (metric === 'max_rpe') return 'Макс. RPE (устар.)'
  return 'Макс. вес'
}

export function formatChallengeValueRu(metric, value) {
  if (value == null || !Number.isFinite(value)) return '—'
  if (metric === 'max_weight') return `${Math.round(value * 10) / 10} кг`
  if (metric === 'max_reps') return `${Math.round(value)}`
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

export function normExerciseName(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseNum(v) {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function safeParseData(raw) {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') return raw
  return {}
}

function exerciseMatchesChallenge(ex, exerciseId, catalogNameNorm) {
  const cid = ex?.catalog_exercise_id
  if (cid && String(cid) === String(exerciseId)) return true
  const n = normExerciseName(ex?.name)
  if (catalogNameNorm && n && n === catalogNameNorm) return true
  return false
}

function bestMetricInExercise(ex, metric) {
  const sets = Array.isArray(ex?.sets) ? ex.sets : []
  let best = null
  for (const set of sets) {
    if (metric === 'max_weight') {
      const v = parseNum(set?.weight_kg)
      if (v != null && v > 0) best = best == null ? v : Math.max(best, v)
    } else if (metric === 'max_reps') {
      const v = parseNum(set?.reps)
      if (v != null && v >= 1) best = best == null ? v : Math.max(best, v)
    } else if (metric === 'max_time_sec') {
      const v = parseNum(set?.tut_sec)
      if (v != null && v > 0) best = best == null ? v : Math.max(best, v)
    } else if (metric === 'max_distance_m') {
      const v = parseNum(set?.distance_m)
      if (v != null && v > 0) best = best == null ? v : Math.max(best, v)
    } else if (metric === 'max_points') {
      const v = parseNum(set?.points)
      if (v != null && v > 0) best = best == null ? v : Math.max(best, v)
    } else if (metric === 'max_rpe') {
      const v = parseNum(set?.rpe)
      if (v != null && v > 0) best = best == null ? v : Math.max(best, v)
    }
  }
  return best
}

function trainingDateInRange(dateStr, start, end) {
  const d = String(dateStr ?? '').slice(0, 10)
  const a = String(start ?? '').slice(0, 10)
  const b = String(end ?? '').slice(0, 10)
  if (!d || !a || !b) return false
  return d >= a && d <= b
}

/**
 * Рейтинг по завершённым тренировкам: для каждого клиента — лучшее значение метрики
 * по всем подходам выбранного упражнения за период (совпадение по catalog_exercise_id или по имени из справочника).
 */
export function buildChallengeLeaderboard(challenge, ctx) {
  const { trainings, clients, exercises } = ctx
  if (!challenge?.club_id || !challenge?.exercise_id || !isKnownChallengeMetric(challenge.metric)) {
    return { rows: [], exerciseName: '—', error: 'invalid_challenge' }
  }

  const exRow = (exercises ?? []).find((e) => String(e.id) === String(challenge.exercise_id))
  const exerciseName = exRow?.name?.trim() || 'Упражнение'
  const nameNorm = normExerciseName(exRow?.name)

  const clientById = new Map((clients ?? []).filter((c) => c?.id).map((c) => [c.id, c]))
  const bestByClient = new Map()

  for (const t of trainings ?? []) {
    const cid = t.client_id
    const clientRow = cid ? clientById.get(cid) : null
    const tClub = String(t.club_id ?? clientRow?.club_id ?? '')
    if (tClub !== String(challenge.club_id)) continue
    if (String(t.status ?? '').toLowerCase() !== 'completed') continue
    if (!trainingDateInRange(t.date, challenge.start_date, challenge.end_date)) continue
    if (!cid) continue

    const data = safeParseData(t.data)
    const workoutExercises = Array.isArray(data.exercises) ? data.exercises : []

    let sessionBest = null
    for (const ex of workoutExercises) {
      if (!exerciseMatchesChallenge(ex, challenge.exercise_id, nameNorm)) continue
      const v = bestMetricInExercise(ex, challenge.metric)
      if (v == null) continue
      sessionBest = sessionBest == null ? v : Math.max(sessionBest, v)
    }
    if (sessionBest == null) continue

    const prev = bestByClient.get(cid)
    bestByClient.set(cid, prev == null ? sessionBest : Math.max(prev, sessionBest))
  }

  const trainerNameById = ctx.trainerNameById instanceof Map ? ctx.trainerNameById : new Map(Object.entries(ctx.trainerNameById ?? {}))

  const rows = []
  for (const [clientId, value] of bestByClient) {
    const c = clientById.get(clientId)
    const trainerId = c?.trainer_id ?? null
    rows.push({
      client_id: clientId,
      client_name: c?.name?.trim() || 'Клиент',
      trainer_id: trainerId,
      trainer_name: trainerId ? trainerNameById.get(trainerId) || `Тренер ${String(trainerId).slice(0, 8)}…` : '—',
      value,
    })
  }

  rows.sort((a, b) => b.value - a.value)

  let rank = 1
  let i = 0
  while (i < rows.length) {
    const val = rows[i].value
    let j = i + 1
    while (j < rows.length && rows[j].value === val) j += 1
    for (let k = i; k < j; k++) rows[k].rank = rank
    rank += j - i
    i = j
  }

  return { rows, exerciseName, error: null }
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
      for (const row of viaApi.trainings) {
        await putStore('trainings', row)
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
  const clients = await getAllStore('clients')
  for (const c of clients ?? []) {
    if (String(c.trainer_id) === tid && c.club_id) out.add(String(c.club_id))
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

  const all = await getAllStore('challenges')
  const idSet = new Set(clubIds)
  const challenges = (all ?? [])
    .filter((c) => idSet.has(String(c.club_id ?? '')))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  return { challenges, pull, clubIds }
}

/**
 * @param {string} clubId
 * @param {{ challenge?: object, pullRemote?: boolean }} [opts]
 */
export async function loadContextForChallengeLeaderboard(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  const ch = opts.challenge
  if (ch && opts.pullRemote !== false && cid && isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
    const from = String(ch.start_date ?? '').slice(0, 10)
    const to = String(ch.end_date ?? '').slice(0, 10)
    if (from && to) {
      try {
        await pullChallengeTrainingsForPeriod(cid, from, to, { notify: opts.notifyPull !== false })
      } catch (e) {
        console.warn('[challenge] pull trainings', e)
      }
    }
  }

  const [trainings, clients, exercises] = await Promise.all([
    getAllStore('trainings'),
    getAllStore('clients'),
    getAllStore('exercises'),
  ])
  const clubClients = (clients ?? []).filter((c) => String(c.club_id) === cid)
  const clientIds = new Set(clubClients.map((c) => c.id))
  const clubTrainings = (trainings ?? []).filter((t) => {
    if (String(t.club_id) === cid) return true
    return t.client_id && clientIds.has(t.client_id)
  })
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
  const rows = await getAllStore('challenges')
  return (rows ?? [])
    .filter((c) => String(c.club_id) === String(clubId))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
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
  await saveLocalWithSync('challenges', payload, {
    table_name: 'challenges',
    operation: 'insert',
    remote_id: null,
  })
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { cloudOk: false, cloudError: 'Нет сети — челлендж только на этом устройстве. Нажмите Sync позже.' }
  }
  const push = await pushRecordViaApi({
    table_name: 'challenges',
    operation: 'insert',
    data: payload,
    remote_id: null,
    local_id: null,
  })
  return push.ok ? { cloudOk: true } : { cloudOk: false, cloudError: push.error ?? 'Не удалось отправить в облако' }
}

/** Повторная отправка челленджа в Supabase (если остался только в IndexedDB). */
export async function pushChallengeToCloud(row) {
  if (!row?.id) return { cloudOk: false, cloudError: 'Нет id челленджа' }
  const payload = { ...row, created_by: row.created_by ?? null }
  const push = await pushRecordViaApi({
    table_name: 'challenges',
    operation: 'insert',
    data: payload,
    remote_id: null,
    local_id: null,
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
  const a = String(d.start_date ?? '').slice(0, 10)
  const b = String(d.end_date ?? '').slice(0, 10)
  if (!a || !b) return { ok: false, message: 'Укажите период' }
  if (b < a) return { ok: false, message: 'Дата окончания раньше начала' }
  const desc = String(d.description ?? '').trim()
  if (desc.length > 4000) return { ok: false, message: 'Описание не длиннее 4000 символов' }
  return { ok: true }
}
