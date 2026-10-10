/**
 * Ежедневник: «повторять каждую неделю» — разворот в обычные отдельные записи (без серии в БД).
 */
import { addDaysToIso } from '../dateRu.js'
import { normalizeScheduleClientIds } from './trainerScheduleCore.js'

/** 16 недель ≈ окно pull вперёд (120 дней) — копии дальше не увидит второй планшет. */
export const SCHEDULE_REPEAT_MAX_WEEKS = 16
export const SCHEDULE_REPEAT_WEEK_OPTIONS = Object.freeze([2, 4, 8, 12, 16])
export const SCHEDULE_REPEAT_DEFAULT_WEEKS = 4

/** Пн = 0 … Вс = 6. @param {string} dayIso */
export function scheduleWeekdayIndex(dayIso) {
  const day = String(dayIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return -1
  const [y, m, d] = day.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

/** @param {unknown} raw */
export function normalizeScheduleRepeatWeekdays(raw) {
  const set = new Set()
  for (const v of Array.isArray(raw) ? raw : []) {
    const n = Number(v)
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n)
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * Дни копий: после исходного дня, в пределах `weeks` недель (исходный день — первая неделя),
 * только выбранные дни недели, не раньше сегодня.
 * @param {{ startDayIso: string, weekdays: number[], weeks: number, todayIso?: string }} p
 * @returns {string[]}
 */
export function buildScheduleRepeatDays({ startDayIso, weekdays, weeks, todayIso = '' }) {
  const start = String(startDayIso ?? '').slice(0, 10)
  const wd = new Set(normalizeScheduleRepeatWeekdays(weekdays))
  const n = Math.min(SCHEDULE_REPEAT_MAX_WEEKS, Math.max(0, Math.floor(Number(weeks) || 0)))
  if (scheduleWeekdayIndex(start) < 0 || !wd.size || n < 1) return []
  const today = String(todayIso ?? '').slice(0, 10)
  const out = []
  for (let i = 1; i < n * 7; i++) {
    const day = addDaysToIso(start, i)
    if (!wd.has(scheduleWeekdayIndex(day))) continue
    if (today && day < today) continue
    out.push(day)
  }
  return out
}

/**
 * Та же запись уже стоит в этот день (время + клиенты / текст) — копию не создаём.
 * @param {object[]} existing
 * @param {{ start_minutes: number, client_ids?: string[], title?: string }} base
 * @param {string} dayIso
 */
export function hasScheduleDuplicateOnDay(existing, base, dayIso) {
  const day = String(dayIso ?? '').slice(0, 10)
  const ids = normalizeScheduleClientIds(base?.client_ids).sort().join(',')
  const title = String(base?.title ?? '').trim()
  return (existing ?? []).some((e) => {
    if (String(e?.day_date ?? '').slice(0, 10) !== day) return false
    if (Number(e?.start_minutes) !== Number(base?.start_minutes)) return false
    const eIds = normalizeScheduleClientIds(e?.client_ids).sort().join(',')
    if (ids || eIds) return ids === eIds
    return String(e?.title ?? '').trim() === title
  })
}

/**
 * План копий для формы: дни к созданию и сколько пропущено как дубли.
 * @param {{ startDayIso: string, weekdays: number[], weeks: number, todayIso?: string }} repeat
 * @param {{ start_minutes: number, client_ids?: string[], title?: string }} base
 * @param {object[]} existing
 */
export function planScheduleRepeatCopies(repeat, base, existing) {
  const days = buildScheduleRepeatDays(repeat)
  const create = days.filter((d) => !hasScheduleDuplicateOnDay(existing, base, d))
  return { days: create, skipped: days.length - create.length }
}
