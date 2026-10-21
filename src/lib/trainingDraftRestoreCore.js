/**
 * Выбор лучшего снимка черновика при восстановлении (IDB / durable / session LRU).
 * Чистая логика — verify в scripts/verify-training-draft-restore.mjs
 */

import { draftRevisionMs, idbTrainingRevisionMs } from './trainingDraftDurableCore.js'
import { shouldRestoreTrainingDraftCandidate } from './trainingDraftCleanupCore.js'

/**
 * «Богатство» содержимого — tie-breaker, если метки времени близки или отсутствуют.
 * @param {object | null | undefined} workoutState
 * @returns {number}
 */
export function workoutDraftContentScore(workoutState) {
  if (!workoutState || typeof workoutState !== 'object') return 0
  let score = 0
  for (const field of ['warmup', 'cooldown', 'trainer_comment', 'training_focus', 'pre_weight_kg']) {
    score += String(workoutState[field] ?? '').trim().length
  }
  for (const field of ['warmup_duration_min', 'cooldown_duration_min', 'mood', 'desire', 'stars']) {
    if (String(workoutState[field] ?? '').trim() !== '') score += 4
  }
  const exercises = workoutState.exercises
  if (!Array.isArray(exercises)) return score
  score += exercises.length * 120
  for (const ex of exercises) {
    if (!ex || typeof ex !== 'object') continue
    if (String(ex.name ?? '').trim()) {
      score += 80
      score += String(ex.name).trim().length
    }
    if (String(ex.muscle_focus ?? '').trim()) score += 10
    const sets = ex.sets
    if (Array.isArray(sets)) {
      score += sets.length * 15
      for (const set of sets) {
        if (!set || typeof set !== 'object') continue
        for (const k of ['reps', 'weight_kg', 'weight', 'rpe', 'hr_after', 'hr', 'tut_sec', 'load', 'duration_sec']) {
          if (String(set[k] ?? '').trim() !== '') score += 3
        }
      }
    }
  }
  return score
}

/**
 * Тихий автосейв снимает форму в начале и может дописать её уже после выбора
 * упражнения из справочника. Тогда в базе остаётся первое слово поиска («Жим»)
 * и пустые повторы, хотя на экране уже «Жим лёжа» и цифры.
 * Берём более полный снимок того же черновика: живая форма или durable.
 * @param {{
 *   trainingId?: string | null,
 *   clientId?: string | null,
 *   snapshot?: object | null,
 *   live?: { loadState?: string, meta?: { trainingId?: string | null }, client?: { id?: string } | null, clientIdParam?: string | null, workoutState?: object } | null,
 *   durable?: { trainingId?: string | null, clientId?: string | null, workoutState?: object } | null,
 * }} opts
 */
export function resolveSilentDraftWorkout(opts = {}) {
  const trainingId = String(opts.trainingId ?? '').trim()
  const expectClient = String(opts.clientId ?? '').trim()
  const snapshot = opts.snapshot && typeof opts.snapshot === 'object' ? opts.snapshot : {}
  let best = snapshot
  let bestScore = workoutDraftContentScore(best)

  const consider = (workout, tid, clientId) => {
    if (!trainingId || String(tid ?? '').trim() !== trainingId) return
    const client = String(clientId ?? '').trim()
    if (expectClient && client && client !== expectClient) return
    if (!workout || typeof workout !== 'object') return
    const score = workoutDraftContentScore(workout)
    if (score > bestScore) {
      best = workout
      bestScore = score
    }
  }

  const live = opts.live
  if (String(live?.loadState ?? '') === 'ok') {
    consider(live?.workoutState, live?.meta?.trainingId, live?.client?.id ?? live?.clientIdParam)
  }
  const durable = opts.durable
  consider(durable?.workoutState, durable?.trainingId, durable?.clientId)
  return best
}

/** Поля, которые экран пишет сам (штамп лояльности, пульс) — это не правка тренера. */
const AUTO_WORKOUT_FIELDS = ['loyalty', 'hr_session']

function workoutTrainerEditKey(workoutState) {
  if (!workoutState || typeof workoutState !== 'object') return ''
  const rest = { ...workoutState }
  for (const k of AUTO_WORKOUT_FIELDS) delete rest[k]
  return JSON.stringify(rest)
}

/**
 * Поздний restore после показа черновика из LRU (/new → /:id, возврат на вкладку).
 * Подменять экран можно, только если тренер с момента показа ничего не ввёл
 * и найденная версия богаче того, что на экране сейчас (INC-2026-10-11-03).
 * @param {{
 *   picked?: { source?: string, workoutState?: object } | null,
 *   shownWorkoutState?: object | null,
 *   liveWorkoutState?: object | null,
 *   idbWorkoutState?: object | null,
 * }} ctx
 * @returns {boolean}
 */
export function shouldApplyLateDraftRestore(ctx = {}) {
  const picked = ctx.picked
  if (!picked || picked.source === 'empty') return false
  if (workoutTrainerEditKey(ctx.liveWorkoutState) !== workoutTrainerEditKey(ctx.shownWorkoutState)) return false
  const pickedScore = workoutDraftContentScore(picked.workoutState)
  return (
    pickedScore > workoutDraftContentScore(ctx.liveWorkoutState) &&
    pickedScore >= workoutDraftContentScore(ctx.idbWorkoutState)
  )
}

/** Если разница revision ≤ этого окна — смотрим «богатство» контента (partial autosave vs полный hide-flush). */
export const TRAINING_DRAFT_RESTORE_RICHNESS_WINDOW_MS = 120_000

/** Минимальный перевес score, чтобы принять более старую, но полную версию. */
export const TRAINING_DRAFT_RESTORE_RICHNESS_MIN_DELTA = 40

const SET_VALUE_KEYS = ['reps', 'weight_kg', 'weight', 'rpe', 'hr_after', 'hr', 'tut_sec', 'load', 'duration_sec']

function filledSetValueCount(workout) {
  const exercises = workout?.exercises
  if (!Array.isArray(exercises)) return 0
  let count = 0
  for (const ex of exercises) {
    if (!Array.isArray(ex?.sets)) continue
    for (const set of ex.sets) {
      if (!set || typeof set !== 'object') continue
      for (const key of SET_VALUE_KEYS) {
        if (String(set[key] ?? '').trim() !== '') count += 1
      }
    }
  }
  return count
}

/**
 * Снимок поиска («Жим», пустые повторы) против выбора из справочника («Жим лёжа», повторы есть).
 * Одинаковые цифры не считаем обрубком: тренер мог сам укоротить название.
 * @param {object | null | undefined} truncated
 * @param {object | null | undefined} full
 * @returns {boolean}
 */
export function isSearchPrefixDraft(truncated, full) {
  const shortList = truncated?.exercises
  const fullList = full?.exercises
  if (!Array.isArray(shortList) || !Array.isArray(fullList)) return false
  if (shortList.length === 0 || shortList.length !== fullList.length) return false
  let prefix = false
  for (let i = 0; i < shortList.length; i += 1) {
    const shortName = String(shortList[i]?.name ?? '').trim()
    const fullName = String(fullList[i]?.name ?? '').trim()
    if (!shortName || !fullName) return false
    if (shortName === fullName) continue
    if (fullName.startsWith(shortName) && fullName.length > shortName.length) {
      prefix = true
      continue
    }
    return false
  }
  if (!prefix) return false
  return filledSetValueCount(full) > filledSetValueCount(truncated)
}

/**
 * @param {{ workoutState?: object, revisionMs?: number, source?: string }} a
 * @param {{ workoutState?: object, revisionMs?: number, source?: string }} b
 * @returns {number} >0 if a wins
 */
export function compareTrainingDraftCandidates(a, b) {
  const msA = Number(a?.revisionMs) || 0
  const msB = Number(b?.revisionMs) || 0
  const scoreA = workoutDraftContentScore(a?.workoutState)
  const scoreB = workoutDraftContentScore(b?.workoutState)
  const within = (newer, older) => newer > 0 && older > 0 && newer - older <= TRAINING_DRAFT_RESTORE_RICHNESS_WINDOW_MS

  if (isSearchPrefixDraft(a?.workoutState, b?.workoutState) && within(msA, msB)) return -1
  if (isSearchPrefixDraft(b?.workoutState, a?.workoutState) && within(msB, msA)) return 1

  if (
    scoreA >= scoreB + TRAINING_DRAFT_RESTORE_RICHNESS_MIN_DELTA &&
    within(msB, msA)
  ) {
    return 1
  }
  if (
    scoreB >= scoreA + TRAINING_DRAFT_RESTORE_RICHNESS_MIN_DELTA &&
    within(msA, msB)
  ) {
    return -1
  }

  if (msA !== msB) return msA - msB
  return scoreA - scoreB
}

/**
 * @param {{
 *   idbRow?: object | null,
 *   durable?: object | null,
 *   session?: { workoutState?: object, revisionMs?: number, trainingId?: string } | null,
 *   blockedTrainingId?: string | null,
 * }} ctx
 * @returns {{
 *   workoutState: object,
 *   trainingType?: string,
 *   trainingDate?: string,
 *   source: 'idb' | 'durable' | 'session' | 'empty',
 * }}
 */
export function pickTrainingDraftRestore(ctx = {}) {
  const empty = {}
  const candidates = []
  const blockedId = String(ctx.blockedTrainingId ?? '').trim()
  const expectClientId = String(ctx.expectClientId ?? ctx.idbRow?.client_id ?? '').trim()

  const idbRow = ctx.idbRow
  if (
    idbRow &&
    typeof idbRow === 'object' &&
    String(idbRow.status ?? '') !== 'completed' &&
    shouldRestoreTrainingDraftCandidate(blockedId, idbRow.id)
  ) {
    const ws = idbRow.data && typeof idbRow.data === 'object' ? idbRow.data : {}
    candidates.push({
      source: 'idb',
      workoutState: ws,
      trainingType: idbRow.type,
      trainingDate: idbRow.date,
      revisionMs: idbTrainingRevisionMs(idbRow),
    })
  }

  const durable = ctx.durable
  if (
    durable &&
    typeof durable === 'object' &&
    String(durable.status ?? 'draft') !== 'completed' &&
    shouldRestoreTrainingDraftCandidate(blockedId, durable.trainingId)
  ) {
    const durableClient = String(durable.clientId ?? '').trim()
    if (!expectClientId || !durableClient || durableClient === expectClientId) {
      const ws = durable.workoutState && typeof durable.workoutState === 'object' ? durable.workoutState : {}
      candidates.push({
        source: 'durable',
        workoutState: ws,
        trainingType: durable.trainingType,
        trainingDate: durable.trainingDate,
        revisionMs: draftRevisionMs(durable.revisedAt),
      })
    }
  }

  const session = ctx.session
  if (session?.workoutState && typeof session.workoutState === 'object') {
    const sessionTid = String(session.trainingId ?? '').trim()
    const sessionClient = String(session.clientId ?? '').trim()
    const clientOk = !expectClientId || !sessionClient || sessionClient === expectClientId
    if (clientOk && (!blockedId || (sessionTid && shouldRestoreTrainingDraftCandidate(blockedId, sessionTid)))) {
      candidates.push({
        source: 'session',
        workoutState: session.workoutState,
        trainingType: session.trainingType,
        trainingDate: session.trainingDate,
        revisionMs: Number(session.revisionMs) || 0,
      })
    }
  }

  if (!candidates.length) {
    return { workoutState: empty, source: 'empty' }
  }

  candidates.sort((a, b) => compareTrainingDraftCandidates(b, a))
  const best = candidates[0]
  return {
    workoutState: best.workoutState ?? empty,
    trainingType: best.trainingType,
    trainingDate: best.trainingDate,
    source: best.source,
  }
}
