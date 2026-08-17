import { cleanupSupersetGroups, normalizeSupersetGroup } from './trainingSuperset.js'
import {
  applyExerciseLaterality,
  exerciseLateralityIsLr,
  formatLateralitySetSummary,
  normalizeSetForStorage,
} from './trainingSetLateralityCore.js'

/** Формат заполнения подходов в одном упражнении (шаблон 1–3). */
export const TRAINING_EXERCISE_FORMATS = ['Силовая', 'Функциональная', 'Кардио']

/** Тип тренировки в trainings.type (в т.ч. смешанная сессия). */
export const TRAINING_SESSION_TYPES = [...TRAINING_EXERCISE_FORMATS, 'Смешанная']

export function normalizeExerciseFormat(format, fallback = 'Силовая') {
  const f = String(format ?? '').trim()
  if (TRAINING_EXERCISE_FORMATS.includes(f)) return f
  const fb = String(fallback ?? '').trim()
  if (TRAINING_EXERCISE_FORMATS.includes(fb)) return fb
  return 'Силовая'
}

export function exerciseFormatIsCardio(format) {
  return normalizeExerciseFormat(format) === 'Кардио'
}

export function exerciseFormatWithSetHr(format) {
  const f = normalizeExerciseFormat(format)
  return f === 'Функциональная' || f === 'Кардио'
}

/** Л/П только у силовой и функциональной: у кардио поля — время/нагрузка, не стороны. */
export function exerciseFormatAllowsLaterality(format) {
  return !exerciseFormatIsCardio(format)
}

/** Тип тренировки в БД: один формат или fallback, если упражнения смешанные. */
export function deriveTrainingTypeFromExercises(exercises, fallback = 'Силовая') {
  const list = Array.isArray(exercises) ? exercises : []
  const formats = list
    .map((ex) => normalizeExerciseFormat(ex?.format, fallback))
    .filter(Boolean)
  const unique = [...new Set(formats)]
  if (unique.length === 1) return unique[0]
  if (unique.length > 1) return 'Смешанная'
  return normalizeExerciseFormat(fallback)
}

export function normalizeExercisesForStorage(exercises, sessionFallback = 'Силовая') {
  const cleaned = cleanupSupersetGroups(Array.isArray(exercises) ? exercises : [])
  return cleaned.map((e) => {
    const format = normalizeExerciseFormat(e?.format, sessionFallback)
    const wantLr = exerciseFormatAllowsLaterality(format) && exerciseLateralityIsLr(e)
    const withLat = applyExerciseLaterality({ ...e, format }, wantLr)
    return {
      ...withLat,
      format,
      laterality: wantLr ? 'lr' : null,
      superset_group: normalizeSupersetGroup(e?.superset_group),
      sets: (withLat.sets ?? []).map((s) => normalizeSetForStorage(s, wantLr)),
    }
  })
}

/** Текст подхода для просмотра дневника. */
export function formatSetSummary(set, format) {
  const st = set && typeof set === 'object' ? set : {}
  const fmt = normalizeExerciseFormat(format)
  const parts = []
  if (fmt === 'Кардио') {
    if (String(st.tut_sec ?? '').trim()) parts.push(`${st.tut_sec} мин`)
    if (String(st.load ?? '').trim()) parts.push(`нагр. ${st.load}`)
    if (String(st.hr_after ?? '').trim()) parts.push(`пульс ${st.hr_after}`)
  } else {
    const lrLine = formatLateralitySetSummary(st)
    if (lrLine) {
      parts.push(lrLine)
    } else {
      if (String(st.weight_kg ?? '').trim()) parts.push(`${st.weight_kg} кг`)
      if (String(st.reps ?? '').trim()) parts.push(`${st.reps} повт.`)
    }
    if (exerciseFormatWithSetHr(fmt) && String(st.hr_after ?? '').trim()) parts.push(`пульс ${st.hr_after}`)
  }
  if (String(st.rpe ?? '').trim()) parts.push(`RPE ${st.rpe}`)
  return parts.join(' · ') || '—'
}
