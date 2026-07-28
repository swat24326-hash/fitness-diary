/**
 * Память шага формы тренировки по id (сплит: переключение черновиков).
 * После remount (loading → ok) тренер возвращается на тот же шаг, не на «Опрос».
 */

export const TRAINING_FORM_STEP_COUNT = 5
/** Индекс вкладки «Упражнения». */
export const TRAINING_FORM_STEP_MAIN = 2

/** @type {Map<string, number>} */
const memory = new Map()

export function clampTrainingFormStep(step) {
  const n = Number(step)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(TRAINING_FORM_STEP_COUNT - 1, Math.trunc(n)))
}

export function rememberTrainingFormStep(trainingId, step) {
  const id = String(trainingId ?? '').trim()
  if (!id) return
  memory.set(id, clampTrainingFormStep(step))
}

/** @returns {number | null} */
export function recallTrainingFormStep(trainingId) {
  const id = String(trainingId ?? '').trim()
  if (!id || !memory.has(id)) return null
  return clampTrainingFormStep(memory.get(id))
}

export function workoutHasNamedExercise(exercises) {
  if (!Array.isArray(exercises)) return false
  return exercises.some((ex) => String(ex?.name ?? '').trim().length > 0)
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
