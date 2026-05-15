import { supabase, isSupabaseConfigured } from './supabase'
import { getDb, getAllStore, putStore } from './localDb'
import { saveLocalWithSync, deleteLocalWithSync } from './syncService'

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
  if (!ch || ch.status !== 'active') return false
  const today = new Date().toISOString().slice(0, 10)
  const a = String(ch.start_date ?? '').slice(0, 10)
  const b = String(ch.end_date ?? '').slice(0, 10)
  if (!a || !b) return false
  return today >= a && today <= b
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
    if (String(t.club_id) !== String(challenge.club_id)) continue
    if (String(t.status ?? '').toLowerCase() !== 'completed') continue
    if (!trainingDateInRange(t.date, challenge.start_date, challenge.end_date)) continue
    const cid = t.client_id
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

async function buildTrainerNameMap() {
  const map = new Map()
  if (!isSupabaseConfigured()) return map
  try {
    const { data, error } = await supabase.from('users').select('id, name').eq('role', 'trainer').order('name')
    if (error) throw error
    for (const u of data ?? []) {
      if (u?.id) map.set(u.id, String(u.name ?? '').trim() || '—')
    }
  } catch {
    /* offline / stub */
  }
  return map
}

export async function loadContextForChallengeLeaderboard(clubId) {
  const [trainings, clients, exercises] = await Promise.all([
    getAllStore('trainings'),
    getAllStore('clients'),
    getAllStore('exercises'),
  ])
  const clubTrainings = (trainings ?? []).filter((t) => String(t.club_id) === String(clubId))
  const clubClients = (clients ?? []).filter((c) => String(c.club_id) === String(clubId))
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
  if (!clubId || !isSupabaseConfigured()) return { ok: false, reason: 'no_club_or_supabase' }
  try {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
    if (error) throw error
    for (const row of data ?? []) {
      await putStore('challenges', row)
    }
    return { ok: true, count: (data ?? []).length }
  } catch (e) {
    return { ok: false, error: e?.message ?? 'Ошибка загрузки челленджей' }
  }
}

export async function listChallengesForClub(clubId, { pullRemote = true } = {}) {
  if (!clubId) return { challenges: [], pull: null }
  let pull = null
  if (pullRemote && isSupabaseConfigured() && typeof navigator !== 'undefined' && navigator.onLine) {
    pull = await pullChallengesForClub(clubId)
  }
  const challenges = await listChallengesLocalForClub(clubId)
  return { challenges, pull }
}

export async function saveNewChallenge(row) {
  await saveLocalWithSync('challenges', row, {
    table_name: 'challenges',
    operation: 'insert',
    remote_id: null,
  })
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
