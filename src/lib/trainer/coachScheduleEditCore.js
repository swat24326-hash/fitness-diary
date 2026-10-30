/**
 * Ежедневник с телефона тренера: правка записи идёт через сервер, а не через очередь планшета.
 * Здесь чистые правила: что телефону можно менять, когда запись устарела (409) и куда её можно перенести.
 */
import { inclusiveCalendarDaysBetween } from '../dateRu.js'
import { normalizeTrainerScheduleEntry } from './trainerScheduleCore.js'
import { coerceScheduleDirectionTypeId } from './trainerScheduleDirectionCore.js'
import { coerceScheduleKindForEntry } from './trainerScheduleKindCore.js'
import { SCHEDULE_DRAG_FREE, SCHEDULE_DRAG_LOCKED, resolveScheduleDragPolicy } from './trainerScheduleDragCore.js'

export const COACH_SCHEDULE_RANGE_MAX_DAYS = 62
export const COACH_SCHEDULE_COPIES_MAX = 120

/** Телефон меняет только содержимое слота; связь с тренировкой, владелец и даты создания — за сервером. */
export const COACH_SCHEDULE_EDIT_FIELDS = [
  'day_date',
  'start_minutes',
  'duration_minutes',
  'title',
  'client_ids',
  'kind',
  'direction_type_id',
]

export const COACH_SCHEDULE_CONFLICT_RU = 'Запись изменилась на планшете — обновите Ежедневник'
export const COACH_SCHEDULE_GONE_RU = 'Запись уже удалили — обновите Ежедневник'
export const COACH_SCHEDULE_LOCKED_RU = 'Тренировка по записи завершена — запись нельзя перенести'
export const COACH_SCHEDULE_SAME_DAY_RU = 'По записи начата тренировка — перенести можно только на другое время этого дня'
export const COACH_SCHEDULE_EMPTY_RU = 'Выберите клиента или напишите заметку'
export const COACH_SCHEDULE_RANGE_RU = 'Некорректный период Ежедневника'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** @param {unknown} from @param {unknown} to */
export function resolveCoachScheduleRange(from, to) {
  const a = String(from ?? '').slice(0, 10)
  const b = String(to ?? '').slice(0, 10)
  if (!ISO_DAY.test(a) || !ISO_DAY.test(b)) return null
  const days = inclusiveCalendarDaysBetween(a, b)
  if (days < 1 || days > COACH_SCHEDULE_RANGE_MAX_DAYS) return null
  return { from: a, to: b }
}

/**
 * Что телефон грузит за раз: весь месяц на экране + дни «День / 3 дня» (могут залезть в соседний месяц).
 * @param {number} year @param {number} month 1–12 @param {string[]} [dayIsos]
 */
export function resolveCoachScheduleWindow(year, month, dayIsos = []) {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  const days = dayIsos.map((d) => String(d ?? '').slice(0, 10)).filter((d) => ISO_DAY.test(d)).sort()
  const all = [`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, '0')}`, ...days].sort()
  const wide = { from: all[0], to: all[all.length - 1] }
  if (resolveCoachScheduleRange(wide.from, wide.to) || !days.length) return wide
  return { from: days[0], to: days[days.length - 1] }
}

/**
 * Телефон правил запись, которую видел с этим updated_at; другая метка = планшет или админ успели раньше.
 * @param {object | null | undefined} existing @param {unknown} baseUpdatedAt
 */
export function isCoachScheduleConflict(existing, baseUpdatedAt) {
  if (!existing) return false
  const seen = Date.parse(String(baseUpdatedAt ?? ''))
  const stored = Date.parse(String(existing.updated_at ?? ''))
  if (!Number.isFinite(seen) || !Number.isFinite(stored)) return true
  return seen !== stored
}

/**
 * Метка правки строго новее прежней: pull планшета берёт облачную строку, только если она не старее локальной.
 * @param {unknown} existingUpdatedAt @param {number} nowMs
 */
export function nextCoachScheduleUpdatedAt(existingUpdatedAt, nowMs) {
  const prev = Date.parse(String(existingUpdatedAt ?? ''))
  const at = Number.isFinite(prev) ? Math.max(nowMs, prev + 1) : nowMs
  return new Date(at).toISOString()
}

/**
 * Перенос записи с тренировкой — то же правило, что у перетаскивания на планшете.
 * @returns {string | null} текст отказа
 */
export function coachScheduleMoveDenial(existing, next, linkedTrainingStatus) {
  if (!existing) return null
  const policy = resolveScheduleDragPolicy(existing, { status: linkedTrainingStatus })
  if (policy === SCHEDULE_DRAG_FREE) return null
  const dayChanged = existing.day_date !== next.day_date
  const timeChanged = Number(existing.start_minutes) !== Number(next.start_minutes)
  if (policy === SCHEDULE_DRAG_LOCKED) return dayChanged || timeChanged ? COACH_SCHEDULE_LOCKED_RU : null
  return dayChanged ? COACH_SCHEDULE_SAME_DAY_RU : null
}

/**
 * Итоговая строка: сохранённая запись + поля телефона; владелец и связь с тренировкой — только с сервера.
 * @param {{ input: object, existing?: object | null, trainerId: string, clubId: string, newId: string, nowMs: number }} p
 * @returns {{ ok: true, row: object } | { ok: false, error: string }}
 */
export function buildCoachScheduleRow({ input, existing = null, trainerId, clubId, newId, nowMs }) {
  const nowIso = new Date(nowMs).toISOString()
  const draft = existing ? { ...existing } : { id: newId, kind: null }
  const src = input && typeof input === 'object' ? input : {}
  for (const key of COACH_SCHEDULE_EDIT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) draft[key] = src[key]
  }
  const row = normalizeTrainerScheduleEntry({
    ...draft,
    trainer_id: trainerId,
    club_id: clubId,
    linked_training_id: existing?.linked_training_id ?? null,
    created_at: existing?.created_at ?? nowIso,
    updated_at: nextCoachScheduleUpdatedAt(existing?.updated_at, nowMs),
  })
  if (!row) return { ok: false, error: COACH_SCHEDULE_EMPTY_RU }
  const { synced: _s, ...payload } = row
  payload.kind = coerceScheduleKindForEntry(payload.kind, payload.client_ids)
  payload.direction_type_id = coerceScheduleDirectionTypeId(payload.kind, payload.direction_type_id)
  return { ok: true, row: payload }
}

/** Дни повтора: только даты, без дублей и без дня самой записи. @param {unknown} days @param {string} skipDay */
export function normalizeCoachScheduleCopyDays(days, skipDay) {
  if (!Array.isArray(days)) return []
  const out = new Set()
  for (const d of days) {
    const iso = String(d ?? '').slice(0, 10)
    if (ISO_DAY.test(iso) && iso !== skipDay) out.add(iso)
    if (out.size >= COACH_SCHEDULE_COPIES_MAX) break
  }
  return [...out].sort()
}
