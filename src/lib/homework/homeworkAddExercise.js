/**
 * Упражнение из библиотеки авто-ДЗ — в конкретную часть занятия (разминка / основная / заминка).
 */
import { HOMEWORK_LIBRARY, homeworkDumbbellNote } from './library/homeworkLibrary.js'

const byId = new Map(HOMEWORK_LIBRARY.map((e) => [e.id, e]))

/** @param {string | null | undefined} label */
export function homeworkPhaseFromLabel(label) {
  const text = String(label ?? '')
  if (text.includes('Разминка')) return 'warmup'
  if (text.includes('Заминка')) return 'cooldown'
  return 'main'
}

/**
 * @param {{ id?: string, name?: string, unit?: string, side?: boolean, how?: string, cue?: string, equip?: string, household?: string, alt?: string }} entry
 * @param {'warmup' | 'main' | 'cooldown'} phase
 */
export function homeworkItemFromLibrary(entry, phase) {
  const id = String(entry?.id ?? '').trim()
  const name = String(entry?.name ?? '').trim()
  if (!id || !name) return null
  const unit = entry.unit === 'sec' ? 'sec' : 'reps'
  const amount = phase === 'warmup' ? (unit === 'sec' ? 40 : 10) : phase === 'cooldown' ? (unit === 'sec' ? 30 : 8) : unit === 'sec' ? 30 : 10
  const base = unit === 'sec' ? `${amount} сек` : String(amount)
  const note = homeworkDumbbellNote(entry, byId)
  return {
    catalog_exercise_id: null,
    library_id: id,
    name,
    sets: phase === 'main' ? 2 : 1,
    reps: entry.side ? `${base} / сторона` : base,
    rest_sec: phase === 'main' ? 30 : 0,
    how: entry.how,
    tip: note ? `${entry.cue}. ${note}` : entry.cue,
  }
}
