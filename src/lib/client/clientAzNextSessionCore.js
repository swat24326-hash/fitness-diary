/**
 * «Следующая тренировка» для /me: персоналка (клиент в client_ids) или группа АЗ
 * (kind=group + direction_type_id совпадает с назначением client_az_instructors).
 * Без React / IDB.
 */

import { formatScheduleTimeRange } from '../trainer/trainerScheduleCore.js'
import { coerceScheduleDirectionTypeId } from '../trainer/trainerScheduleDirectionCore.js'
import { SCHEDULE_KIND_GROUP, resolveScheduleEntryKind } from '../trainer/trainerScheduleKindCore.js'

export { coerceScheduleDirectionTypeId, isScheduleDirectionUuid } from '../trainer/trainerScheduleDirectionCore.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const day = (v) => String(v ?? '').slice(0, 10)

/**
 * Пары инструктор+направление, по которым клиент видит группы.
 * @param {Array<{ instructor_id?: unknown, direction_type_id?: unknown }>|null|undefined} azLinks
 * @returns {Set<string>} ключи `instructorId:directionTypeId`
 */
export function clientAzGroupMatchKeys(azLinks) {
  const out = new Set()
  for (const row of azLinks ?? []) {
    const instructor = String(row?.instructor_id ?? '').trim()
    const direction = String(row?.direction_type_id ?? '').trim()
    if (!instructor || !direction) continue
    out.add(`${instructor}:${direction}`)
  }
  return out
}

/**
 * Слот ещё актуален (не закончился сегодня / не в прошлом).
 * @param {object} entry
 * @param {string} today
 * @param {number} nowMinutes
 */
export function isScheduleEntryUpcoming(entry, today, nowMinutes) {
  const d = day(entry?.day_date)
  if (!ISO.test(d) || d < today) return false
  if (d > today) return true
  return Number(entry?.start_minutes) + Number(entry?.duration_minutes ?? 60) > Number(nowMinutes)
}

/**
 * Все будущие слоты клиента (персоналка + свои группы АЗ), по времени.
 * Плитка «Следующая» берёт первый; календарь — все даты.
 * @param {{
 *   personalEntries?: object[],
 *   groupEntries?: object[],
 *   azLinks?: Array<{ instructor_id?: unknown, direction_type_id?: unknown }>,
 *   today: string,
 *   nowMinutes: number,
 *   trainerNameById?: Map<string, string>|Record<string, string>,
 *   directionNameById?: Map<string, string>|Record<string, string>,
 * }} input
 * @returns {Array<{
 *   date: string,
 *   time: string,
 *   trainer_name: string|null,
 *   kind: 'personal'|'group',
 *   direction_name: string|null,
 * }>}
 */
export function listClientUpcomingSessions(input) {
  const today = day(input?.today)
  const nowMinutes = Number(input?.nowMinutes) || 0
  const nameMap = toMap(input?.trainerNameById)
  const dirMap = toMap(input?.directionNameById)
  const azKeys = clientAzGroupMatchKeys(input?.azLinks)

  /** @type {Array<{ entry: object, kind: 'personal'|'group', directionId: string|null }>} */
  const candidates = []
  const seen = new Set()

  for (const entry of input?.personalEntries ?? []) {
    /* Группа с client_ids не должна стать «персоналкой» на плитке. */
    if (resolveScheduleEntryKind(entry) === SCHEDULE_KIND_GROUP) continue
    const id = String(entry?.id ?? `${day(entry?.day_date)}:${entry?.start_minutes}:${entry?.trainer_id}`)
    if (seen.has(id) || !isScheduleEntryUpcoming(entry, today, nowMinutes)) continue
    seen.add(id)
    candidates.push({ entry, kind: 'personal', directionId: null })
  }

  for (const entry of input?.groupEntries ?? []) {
    if (resolveScheduleEntryKind(entry) !== SCHEDULE_KIND_GROUP) continue
    const trainerId = String(entry?.trainer_id ?? '').trim()
    const directionId = coerceScheduleDirectionTypeId(SCHEDULE_KIND_GROUP, entry?.direction_type_id)
    if (!trainerId || !directionId || !azKeys.has(`${trainerId}:${directionId}`)) continue
    const id = String(entry?.id ?? `g:${day(entry?.day_date)}:${entry?.start_minutes}:${trainerId}:${directionId}`)
    if (seen.has(id) || !isScheduleEntryUpcoming(entry, today, nowMinutes)) continue
    seen.add(id)
    candidates.push({ entry, kind: 'group', directionId })
  }

  candidates.sort(
    (a, b) =>
      day(a.entry.day_date).localeCompare(day(b.entry.day_date)) ||
      Number(a.entry.start_minutes) - Number(b.entry.start_minutes),
  )
  return candidates.map(({ entry, kind, directionId }) => {
    const trainerId = String(entry.trainer_id ?? '')
    return {
      date: day(entry.day_date),
      time: formatScheduleTimeRange(entry),
      trainer_name: nameMap.get(trainerId) || null,
      kind,
      direction_name: directionId ? dirMap.get(directionId) || null : null,
    }
  })
}

/**
 * @param {Parameters<typeof listClientUpcomingSessions>[0]} input
 * @returns {ReturnType<typeof listClientUpcomingSessions>[number] | null}
 */
export function pickClientNextSession(input) {
  return listClientUpcomingSessions(input)[0] ?? null
}

/**
 * Подпись под плиткой «Следующая» (канон CLIENT_APP).
 * @param {{ kind?: unknown, trainer_name?: unknown, direction_name?: unknown } | null | undefined} session
 */
export function clientNextSessionFootRu(session) {
  if (!session) return 'Договоритесь с тренером'
  if (String(session.kind) === 'group') {
    const dir = String(session.direction_name ?? '').trim()
    return dir ? `${dir} · группа` : 'Группа'
  }
  const name = String(session.trainer_name ?? '').trim()
  return name ? `персоналка · ${name}` : 'персоналка'
}

function toMap(src) {
  if (!src) return new Map()
  if (src instanceof Map) return src
  return new Map(Object.entries(src).map(([k, v]) => [String(k), String(v ?? '')]))
}
