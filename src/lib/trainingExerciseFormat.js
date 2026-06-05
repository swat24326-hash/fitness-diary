import { cleanupSupersetGroups, normalizeSupersetGroup } from './trainingSuperset.js'

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
  return cleaned.map((e) => ({
    ...e,
    format: normalizeExerciseFormat(e?.format, sessionFallback),
    superset_group: normalizeSupersetGroup(e?.superset_group),
    sets: (e?.sets ?? []).map((s) => ({
      reps: s?.reps ?? '',
      weight_kg: s?.weight_kg ?? '',
      tut_sec: s?.tut_sec ?? '',
      load: s?.load ?? '',
      rpe: s?.rpe ?? '',
      hr_after: s?.hr_after ?? '',
    })),
  }))
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
    if (String(st.weight_kg ?? '').trim()) parts.push(`${st.weight_kg} кг`)
    if (String(st.reps ?? '').trim()) parts.push(`${st.reps} повт.`)
    if (exerciseFormatWithSetHr(fmt) && String(st.hr_after ?? '').trim()) parts.push(`пульс ${st.hr_after}`)
  }
  if (String(st.rpe ?? '').trim()) parts.push(`RPE ${st.rpe}`)
  return parts.join(' · ') || '—'
}
