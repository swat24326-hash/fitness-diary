/**
 * Окно тренировки в приложении клиента: то же, что видит тренер в «Просмотре тренировки»,
 * но без заметок (решение владельца 2026-10-08): опрос, комментарий тренера и комментарии к подходам не уходят.
 * Белый список полей data — служебное (membership_id, флаги черновика, списание) тоже не уходит.
 */
import { normalizeHrSessionSnapshot } from '../../../src/lib/hr/hrSessionAgg.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_EXERCISES = 80
const MAX_SETS = 40

/** Поля, которые рисует TrainingViewModal. */
const VIEW_FIELDS = [
  'pre_weight_kg',
  'pre_hr',
  'readiness',
  'warmup',
  'warmup_duration_min',
  'training_focus',
  'cooldown',
  'cooldown_duration_min',
  'rpe',
  'stars',
]

const NOTE_KEY = /comment|note/i

function withoutNotes(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !NOTE_KEY.test(k)))
}

export function isClientTrainingId(raw) {
  return UUID.test(String(raw ?? ''))
}

function parseData(raw) {
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw ?? '')) ?? {}
  } catch {
    return {}
  }
}

function exercisesView(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((ex) => ex && typeof ex === 'object')
    .slice(0, MAX_EXERCISES)
    .map((ex) => ({
      ...withoutNotes(ex),
      sets: Array.isArray(ex.sets)
        ? ex.sets.slice(0, MAX_SETS).map((st) => (st && typeof st === 'object' ? withoutNotes(st) : {}))
        : [],
    }))
}

/**
 * @param {{ id: string, date: string, type?: string, data?: unknown }} row завершённая тренировка этого клиента
 * @returns {{ id: string, date: string, type: string, status: 'completed', trainer_name: string|null, data: object }}
 */
export function buildClientTrainingView(row, trainerName) {
  const src = parseData(row?.data)
  const data = {}
  for (const k of VIEW_FIELDS) {
    const v = src[k]
    if (v != null && v !== '' && (typeof v === 'string' || typeof v === 'number')) data[k] = v
  }
  const hr = normalizeHrSessionSnapshot(src.hr_session)
  if (hr) data.hr_session = hr
  const exercises = exercisesView(src.exercises)
  if (exercises.length) data.exercises = exercises
  return {
    id: String(row.id),
    date: String(row.date ?? '').slice(0, 10),
    type: String(row.type ?? ''),
    status: 'completed',
    trainer_name: trainerName || null,
    data,
  }
}
