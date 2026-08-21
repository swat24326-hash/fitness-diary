/**
 * Память места в форме тренировки по id (сплит вкладок черновиков).
 * После remount / loading→ok: тот же шаг, свёртки, прокрутка к упражнению.
 * Не путать с данными workout — только UI-место сессии на устройстве.
 */

export const TRAINING_FORM_STEP_COUNT = 5
/** Индекс вкладки «Упражнения». */
export const TRAINING_FORM_STEP_MAIN = 2

/**
 * @typedef {{
 *   step: number,
 *   focusExerciseId?: string | null,
 *   scrollY?: number,
 *   collapsedIds?: string[],
 * }} TrainingFormPlace
 */

/** @type {Map<string, TrainingFormPlace>} */
const memory = new Map()

export function clampTrainingFormStep(step) {
  const n = Number(step)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(TRAINING_FORM_STEP_COUNT - 1, Math.trunc(n)))
}

/** @param {unknown} ids */
export function normalizeCollapsedIds(ids) {
  if (!Array.isArray(ids)) return []
  const out = []
  const seen = new Set()
  for (const raw of ids) {
    const id = String(raw ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= 40) break
  }
  return out
}

/**
 * Ключ памяти: реальный training id или стабильный `new:<clientId>` до первого save.
 * @param {{ trainingId?: string | null, routeId?: string | null, clientId?: string | null }} opts
 */
export function resolveTrainingFormPlaceKey(opts = {}) {
  const trainingId = String(opts.trainingId ?? '').trim()
  if (trainingId) return trainingId
  const routeId = String(opts.routeId ?? '').trim()
  if (routeId && routeId !== 'new') return routeId
  const clientId = String(opts.clientId ?? '').trim()
  if (clientId) return `new:${clientId}`
  return ''
}

/**
 * После /new → /workouts/:id переносим место, чтобы не сбрасывать на «Опрос».
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 */
export function migrateTrainingFormPlace(fromId, toId) {
  const from = String(fromId ?? '').trim()
  const to = String(toId ?? '').trim()
  if (!from || !to || from === to) return false
  if (!memory.has(from)) return false
  const place = memory.get(from)
  memory.set(to, place)
  memory.delete(from)
  return true
}

/**
 * @param {string | null | undefined} trainingId
 * @param {Partial<TrainingFormPlace>} patch
 */
export function rememberTrainingFormPlace(trainingId, patch = {}) {
  const id = String(trainingId ?? '').trim()
  if (!id) return
  const prev = memory.get(id) ?? { step: 0 }
  /** @type {TrainingFormPlace} */
  const next = {
    step: patch.step != null ? clampTrainingFormStep(patch.step) : clampTrainingFormStep(prev.step),
  }
  if (patch.focusExerciseId !== undefined) {
    const fid = String(patch.focusExerciseId ?? '').trim()
    next.focusExerciseId = fid || null
  } else if (prev.focusExerciseId != null) {
    next.focusExerciseId = prev.focusExerciseId
  }
  if (patch.scrollY !== undefined) {
    const y = Number(patch.scrollY)
    next.scrollY = Number.isFinite(y) && y >= 0 ? Math.min(y, 100000) : 0
  } else if (prev.scrollY != null) {
    next.scrollY = prev.scrollY
  }
  if (patch.collapsedIds !== undefined) {
    next.collapsedIds = normalizeCollapsedIds(patch.collapsedIds)
  } else if (prev.collapsedIds) {
    next.collapsedIds = prev.collapsedIds
  }
  memory.set(id, next)
}

/** Совместимость: только шаг. */
export function rememberTrainingFormStep(trainingId, step) {
  rememberTrainingFormPlace(trainingId, { step })
}

/** @returns {TrainingFormPlace | null} */
export function recallTrainingFormPlace(trainingId) {
  const id = String(trainingId ?? '').trim()
  if (!id || !memory.has(id)) return null
  const raw = memory.get(id)
  return {
    step: clampTrainingFormStep(raw?.step),
    focusExerciseId: raw?.focusExerciseId ? String(raw.focusExerciseId) : null,
    scrollY: Number.isFinite(Number(raw?.scrollY)) ? Number(raw.scrollY) : 0,
    collapsedIds: normalizeCollapsedIds(raw?.collapsedIds),
  }
}

/** @returns {number | null} */
export function recallTrainingFormStep(trainingId) {
  const place = recallTrainingFormPlace(trainingId)
  return place ? place.step : null
}

export function workoutHasNamedExercise(exercises) {
  if (!Array.isArray(exercises)) return false
  return exercises.some((ex) => String(ex?.name ?? '').trim().length > 0)
}

/**
 * @param {unknown} exercises
 * @param {string | null | undefined} exerciseId
 * @returns {number | null}
 */
export function indexOfExerciseId(exercises, exerciseId) {
  const id = String(exerciseId ?? '').trim()
  if (!id || !Array.isArray(exercises)) return null
  const idx = exercises.findIndex((ex) => String(ex?.id ?? '').trim() === id)
  return idx >= 0 ? idx : null
}

/**
 * @param {string[] | undefined} collapsedIds
 * @param {unknown} exercises
 */
export function filterCollapsedIdsForExercises(collapsedIds, exercises) {
  const valid = new Set(
    (Array.isArray(exercises) ? exercises : [])
      .map((ex) => String(ex?.id ?? '').trim())
      .filter(Boolean),
  )
  return normalizeCollapsedIds(collapsedIds).filter((id) => valid.has(id))
}

/**
 * Куда вернуть прокрутку после смены вкладки.
 * @param {TrainingFormPlace | null | undefined} place
 * @returns {{ type: 'exercise', id: string } | { type: 'y', y: number } | null}
 */
export function pickScrollRestoreTarget(place) {
  if (!place) return null
  const exId = String(place.focusExerciseId ?? '').trim()
  if (exId) return { type: 'exercise', id: exId }
  const y = Number(place.scrollY)
  if (Number.isFinite(y) && y > 0) return { type: 'y', y }
  return null
}

/** Безопасный escape для querySelector attr (старые WebView без CSS.escape). */
export function escapeTrainingExerciseSelectorId(id) {
  const s = String(id ?? '')
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s)
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Шаг при открытии черновика: запомненный, иначе «Упражнения» если уже есть названия, иначе опрос.
 * @param {{ trainingId?: string | null, exercises?: unknown }} [opts]
 */
export function resolveTrainingFormStep(opts = {}) {
  const remembered = recallTrainingFormStep(opts.trainingId)
  if (remembered != null) return remembered
  if (workoutHasNamedExercise(opts.exercises)) return TRAINING_FORM_STEP_MAIN
  return 0
}

/** Только для verify / тестов. */
export function clearTrainingFormStepMemory() {
  memory.clear()
}

/** @alias clearTrainingFormStepMemory */
export function clearTrainingFormPlaceMemory() {
  memory.clear()
}
