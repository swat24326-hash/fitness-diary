/**
 * Текст тренировки для буфера — вставка в Whoop Strength Trainer (Import using AI) и похожие приложения.
 * Без заметок тренера и опроса.
 */
import { formatDateRu } from '../dateRu.js'
import { formatSetSummary, normalizeExerciseFormat } from '../trainingExerciseFormat.js'

/**
 * Строка подхода в виде, удобном для ИИ Whoop: «80 кг × 5».
 * @param {object} set
 * @param {string} [format]
 */
export function formatSetLineForCopy(set, format) {
  const st = set && typeof set === 'object' ? set : {}
  const fmt = normalizeExerciseFormat(format)
  if (fmt === 'Кардио') {
    const line = formatSetSummary(st, fmt)
    return line && line !== '—' ? line : ''
  }
  const w = String(st.weight_kg ?? '').trim()
  const r = String(st.reps ?? '').trim()
  if (w && r) return `${w} кг × ${r}`
  if (w) return `${w} кг`
  if (r) return `${r} повт.`
  const fallback = formatSetSummary(st, fmt)
  return fallback && fallback !== '—' ? fallback : ''
}

/**
 * @param {{ date?: string, type?: string, data?: object } | null | undefined} training
 * @returns {string}
 */
export function buildClientTrainingCopyText(training) {
  if (!training || typeof training !== 'object') return ''
  const data = training.data && typeof training.data === 'object' ? training.data : {}
  const date = String(training.date ?? '').slice(0, 10)
  const focus = String(data.training_focus ?? '').trim()
  const type = String(training.type ?? '').trim()
  const headParts = ['Тренировка']
  if (date) headParts.push(formatDateRu(date))
  if (focus) headParts.push(focus)
  else if (type) headParts.push(type)

  /** @type {string[]} */
  const lines = [headParts.join(' · ')]
  const exercises = Array.isArray(data.exercises) ? data.exercises : []
  for (const ex of exercises) {
    if (!ex || typeof ex !== 'object') continue
    const name = String(ex.name ?? ex.exercise_name ?? '').trim()
    if (!name) continue
    lines.push('')
    lines.push(name)
    const sets = Array.isArray(ex.sets) ? ex.sets : []
    for (const st of sets) {
      const line = formatSetLineForCopy(st, ex.format ?? type)
      if (line) lines.push(line)
    }
  }
  if (lines.length === 1) return ''
  return lines.join('\n').trim()
}
