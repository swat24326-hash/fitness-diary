/**
 * Ежедневник: категория записи (цвет = смысл) и состояние для оформления.
 */
import { normalizeScheduleClientIds } from './trainerScheduleCore.js'

export const SCHEDULE_KIND_TRAINING = 'training'
export const SCHEDULE_KIND_GROUP = 'group'
export const SCHEDULE_KIND_TRIAL = 'trial'
export const SCHEDULE_KIND_WORK = 'work'
export const SCHEDULE_KIND_PERSONAL = 'personal'

/** Порядок = порядок плашек в форме и в легенде. */
export const SCHEDULE_KINDS = Object.freeze([
  { id: SCHEDULE_KIND_TRAINING, label: 'Тренировка', withClients: 'required' },
  { id: SCHEDULE_KIND_GROUP, label: 'Групповое', withClients: 'optional' },
  { id: SCHEDULE_KIND_TRIAL, label: 'Пробное', withClients: 'optional' },
  { id: SCHEDULE_KIND_WORK, label: 'Работа', withClients: 'none' },
  { id: SCHEDULE_KIND_PERSONAL, label: 'Личное', withClients: 'none' },
])

const KIND_BY_ID = new Map(SCHEDULE_KINDS.map((k) => [k.id, k]))

/** @param {unknown} raw — допустимая категория или null */
export function normalizeScheduleKind(raw) {
  const id = String(raw ?? '').trim()
  return KIND_BY_ID.has(id) ? id : null
}

/** @param {string} kind */
export function scheduleKindAllowsClients(kind) {
  return KIND_BY_ID.get(kind)?.withClients !== 'none'
}

/** @param {string} kind */
export function scheduleKindRequiresClients(kind) {
  return KIND_BY_ID.get(kind)?.withClients === 'required'
}

/**
 * Категория для хранения: только сочетание, которое не противоречит клиентам.
 * Иначе null — тогда показываем категорию по умолчанию.
 * @param {unknown} rawKind
 * @param {unknown} rawClientIds
 */
export function coerceScheduleKindForEntry(rawKind, rawClientIds) {
  const kind = normalizeScheduleKind(rawKind)
  if (!kind) return null
  const hasClients = normalizeScheduleClientIds(rawClientIds).length > 0
  if (hasClients && !scheduleKindAllowsClients(kind)) return null
  if (!hasClients && scheduleKindRequiresClients(kind)) return null
  return kind
}

/**
 * Категория для показа: сохранённая или по умолчанию (клиенты → «Тренировка», заметка → «Личное»).
 * @param {{ kind?: unknown, client_ids?: unknown } | null | undefined} entry
 */
export function resolveScheduleEntryKind(entry) {
  return (
    coerceScheduleKindForEntry(entry?.kind, entry?.client_ids) ??
    (normalizeScheduleClientIds(entry?.client_ids).length ? SCHEDULE_KIND_TRAINING : SCHEDULE_KIND_PERSONAL)
  )
}

/** @param {string} kind */
export function scheduleKindLabel(kind) {
  return KIND_BY_ID.get(kind)?.label ?? 'Личное'
}

/**
 * Режим формы после выбора категории: клиенты, заметка или оба варианта.
 * @param {string} kind
 * @returns {'clients' | 'note' | 'either'}
 */
export function scheduleKindFormMode(kind) {
  const w = KIND_BY_ID.get(kind)?.withClients
  if (w === 'required') return 'clients'
  if (w === 'none') return 'note'
  return 'either'
}

/**
 * Оформление состояния: черновик — пунктир, завершена — галочка, прошедшее — бледнее.
 * @param {{ day_date?: string, start_minutes?: number, duration_minutes?: number } | null | undefined} entry
 * @param {{ status?: string } | null | undefined} linkedTraining
 * @param {{ todayIso: string, nowMinutes: number }} now
 * @returns {{ draft: boolean, done: boolean, past: boolean }}
 */
export function resolveScheduleEntryState(entry, linkedTraining, now) {
  const status = String(linkedTraining?.status ?? '')
  const day = String(entry?.day_date ?? '').slice(0, 10)
  const today = String(now?.todayIso ?? '').slice(0, 10)
  const end = (Number(entry?.start_minutes) || 0) + (Number(entry?.duration_minutes) || 60)
  const past = Boolean(day && today) && (day < today || (day === today && end <= Number(now?.nowMinutes)))
  return { draft: status === 'draft', done: status === 'completed', past }
}
