/** Чистая логика рейтинга челленджей (без React / IDB / Supabase). */

export const CHALLENGE_METRICS = ['max_weight', 'max_reps', 'max_time_sec', 'max_distance_m']

const LEGACY_METRICS = ['max_rpe', 'max_points']

export const CHALLENGE_REF_WEIGHT_TOLERANCE_KG = 0.5

function isKnownChallengeMetric(metric) {
  return CHALLENGE_METRICS.includes(metric) || LEGACY_METRICS.includes(metric)
}

function parseNum(v) {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function parseReferenceWeightKg(raw) {
  const n = Number(String(raw ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

export function weightMatchesReferenceKg(weightKg, referenceKg, toleranceKg = CHALLENGE_REF_WEIGHT_TOLERANCE_KG) {
  const w = parseNum(weightKg)
  const r = parseReferenceWeightKg(referenceKg)
  if (w == null || r == null) return false
  return Math.abs(w - r) <= toleranceKg
}

export function bestMaxRepsFromSets(sets, referenceWeightKg = null) {
  const ref = parseReferenceWeightKg(referenceWeightKg)
  let bestReps = null
  let weightAtBest = null

  for (const set of sets ?? []) {
    const reps = parseNum(set?.reps)
    if (reps == null || reps < 1) continue
    const w = parseNum(set?.weight_kg)

    if (ref != null) {
      if (!weightMatchesReferenceKg(w, ref)) continue
      if (bestReps == null || reps > bestReps) {
        bestReps = reps
        weightAtBest = ref
      }
    } else if (bestReps == null || reps > bestReps || (reps === bestReps && (w ?? 0) > (weightAtBest ?? -1))) {
      bestReps = reps
      weightAtBest = w
    }
  }

  if (bestReps == null) return null
  return { value: bestReps, weight_kg: ref != null ? ref : null }
}

export function normExerciseName(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
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

function bestMetricInExercise(ex, challenge) {
  const metric = challenge?.metric
  const sets = Array.isArray(ex?.sets) ? ex.sets : []
  if (metric === 'max_reps') {
    const hit = bestMaxRepsFromSets(sets, challenge?.reference_weight_kg)
    return hit?.value ?? null
  }
  let best = null
  for (const set of sets) {
    if (metric === 'max_weight') {
      const v = parseNum(set?.weight_kg)
      if (v != null && v > 0) best = best == null ? v : Math.max(best, v)
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
      const v = bestMetricInExercise(ex, challenge)
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

export function normalizeChallengeReferenceWeight(metric, raw) {
  if (metric !== 'max_reps') return null
  return parseReferenceWeightKg(raw)
}
