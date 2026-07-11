/** Есть ли в строке подхода хотя бы одно заполненное поле */
import { getHealthCardCompletionIssues } from './healthCardCore.js'

function setRowHasData(s) {
  if (!s || typeof s !== 'object') return false
  const keys = ['reps', 'weight_kg', 'tut_sec', 'load', 'rpe', 'hr_after']
  return keys.some((k) => String(s[k] ?? '').trim() !== '')
}

function surveyBlockOk(w) {
  const mood = Number(String(w.mood ?? '').trim())
  const desire = Number(String(w.desire ?? '').trim())
  const sleep = String(w.sleep_hours ?? '').trim().replace(',', '.')
  const meal = String(w.hours_after_meal ?? '').trim().replace(',', '.')
  const moodOk = String(w.mood ?? '').trim() !== '' && Number.isFinite(mood) && mood >= 1 && mood <= 5
  const desireOk = String(w.desire ?? '').trim() !== '' && Number.isFinite(desire) && desire >= 1 && desire <= 5
  return (
    moodOk &&
    desireOk &&
    sleep !== '' &&
    Number.isFinite(Number(sleep)) &&
    meal !== '' &&
    Number.isFinite(Number(meal))
  )
}

function warmupBlockOk(w) {
  const wdm = String(w.warmup_duration_min ?? '').trim()
  return String(w.warmup ?? '').trim() !== '' && wdm !== '' && Number.isFinite(Number(wdm))
}

function cooldownBlockOk(w) {
  const cdm = String(w.cooldown_duration_min ?? '').trim()
  return String(w.cooldown ?? '').trim() !== '' && cdm !== '' && Number.isFinite(Number(cdm))
}

function exercisesBlockOk(w) {
  const exercises = Array.isArray(w.exercises) ? w.exercises : []
  return exercises.some((ex) => {
    if (!ex?.catalog_exercise_id) return false
    const sets = Array.isArray(ex.sets) ? ex.sets : []
    return sets.some((s) => setRowHasData(s))
  })
}

/**
 * Проверка перед завершением тренировки (комментарий в итоге — не обязателен).
 * @param {object} workout
 * @param {{ health?: object | null, isFirstCompletion?: boolean }} [ctx]
 * @returns {string[]}
 */
export function getTrainingCompletionIssues(workout, ctx = {}) {
  const w = workout && typeof workout === 'object' ? workout : {}
  const issues = []

  if (ctx.isFirstCompletion) {
    issues.push(...getHealthCardCompletionIssues(ctx.health))
  }

  const weightStr = String(w.pre_weight_kg ?? '').trim().replace(',', '.')
  const weightNum = Number(weightStr)
  if (!weightStr || !Number.isFinite(weightNum) || weightNum <= 0) {
    issues.push('Заполни вес.')
  }

  if (!String(w.training_focus ?? '').trim()) {
    issues.push('Заполни направленность.')
  }

  if (!surveyBlockOk(w)) {
    issues.push('Заполни вкладку «Опрос».')
  }

  if (!warmupBlockOk(w)) {
    issues.push('Заполни вкладку «Разминка».')
  }

  if (!cooldownBlockOk(w)) {
    issues.push('Заполни вкладку «Заминка».')
  }

  if (!exercisesBlockOk(w)) {
    issues.push('Заполни вкладку «Упражнения».')
  }

  const stars = Number(w.stars)
  if (!w.stars || !Number.isFinite(stars) || stars < 1 || stars > 5) {
    issues.push('Заполни вкладку «Итог».')
  }

  return issues
}
