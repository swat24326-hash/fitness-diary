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
    if (String(ex.name ?? '').trim()) score += 80
    if (String(ex.muscle_focus ?? '').trim()) score += 10
    const sets = ex.sets
    if (Array.isArray(sets)) {
      score += sets.length * 15
      for (const set of sets) {
        if (!set || typeof set !== 'object') continue
        for (const k of ['reps', 'weight', 'rpe', 'hr', 'duration_sec']) {
          if (String(set[k] ?? '').trim() !== '') score += 3
        }
      }
    }
  }
  return score
}

/** Если разница revision ≤ этого окна — смотрим «богатство» контента (partial autosave vs полный hide-flush). */
export const TRAINING_DRAFT_RESTORE_RICHNESS_WINDOW_MS = 120_000

/** Минимальный перевес score, чтобы принять более старую, но полную версию. */
export const TRAINING_DRAFT_RESTORE_RICHNESS_MIN_DELTA = 40

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

  if (
    scoreA >= scoreB + TRAINING_DRAFT_RESTORE_RICHNESS_MIN_DELTA &&
    msA > 0 &&
    msB > 0 &&
    msB - msA <= TRAINING_DRAFT_RESTORE_RICHNESS_WINDOW_MS
  ) {
    return 1
  }
  if (
    scoreB >= scoreA + TRAINING_DRAFT_RESTORE_RICHNESS_MIN_DELTA &&
    msA > 0 &&
    msB > 0 &&
    msA - msB <= TRAINING_DRAFT_RESTORE_RICHNESS_WINDOW_MS
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
