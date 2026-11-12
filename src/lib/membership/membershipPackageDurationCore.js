/**
 * Длительность пакета абонемента: месяцы (с числа на число), 1.5 мес, произвольные дни.
 * Снимок на строке memberships: duration_unit + duration_count.
 */
import {
  addCalendarDaysIso,
  addMonthsToIso,
  defaultMembershipEndIso,
  inclusiveCalendarDaysBetween,
} from '../dateRu.js'

export const MEMBERSHIP_DURATION_UNIT_MONTHS = 'months'
export const MEMBERSHIP_DURATION_UNIT_DAYS = 'days'

/** Пресеты месяцев в UI (включая 1.5). */
export const MEMBERSHIP_DURATION_MONTH_PRESETS = [1, 1.5, 2, 3, 4, 6, 12]

export const MEMBERSHIP_DURATION_DAYS_MAX = 366
export const MEMBERSHIP_DURATION_MONTHS_MAX = 36

/** Sentinel UI: «Другое…» (дни). */
export const MEMBERSHIP_DURATION_PRESET_CUSTOM = '__custom__'

/**
 * @param {unknown} unit
 * @returns {'months'|'days'|''}
 */
export function normalizeMembershipDurationUnit(unit) {
  const u = String(unit ?? '')
    .trim()
    .toLowerCase()
  if (u === MEMBERSHIP_DURATION_UNIT_DAYS) return MEMBERSHIP_DURATION_UNIT_DAYS
  if (u === MEMBERSHIP_DURATION_UNIT_MONTHS) return MEMBERSHIP_DURATION_UNIT_MONTHS
  return ''
}

/**
 * @param {unknown} unit
 * @param {unknown} count
 * @returns {{ unit: 'months'|'days', count: number } | null}
 */
export function normalizeMembershipDuration(unit, count) {
  const u = normalizeMembershipDurationUnit(unit)
  if (!u) return null
  const n = Number(count)
  if (!Number.isFinite(n) || n <= 0) return null
  if (u === MEMBERSHIP_DURATION_UNIT_DAYS) {
    const days = Math.trunc(n)
    if (days < 1 || days > MEMBERSHIP_DURATION_DAYS_MAX) return null
    return { unit: u, count: days }
  }
  // months: целые или ровно 1.5
  if (n === 1.5) return { unit: u, count: 1.5 }
  const months = Math.trunc(n)
  if (months < 1 || months > MEMBERSHIP_DURATION_MONTHS_MAX) return null
  if (months !== n) return null
  return { unit: u, count: months }
}

/**
 * Конец пакета от старта по длительности.
 * months: с числа на число; 1.5 = +1 календарный месяц + 14 дней.
 * days: N календарных дней включительно (1 → тот же день).
 *
 * @param {string} startIso
 * @param {unknown} unit
 * @param {unknown} count
 */
export function membershipPackageEndIso(startIso, unit, count) {
  const start = String(startIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return ''
  const dur = normalizeMembershipDuration(unit, count)
  if (!dur) return ''
  if (dur.unit === MEMBERSHIP_DURATION_UNIT_DAYS) {
    return addCalendarDaysIso(start, dur.count - 1)
  }
  if (dur.count === 1.5) {
    const afterMonth = addMonthsToIso(start, 1)
    return addCalendarDaysIso(afterMonth, 14)
  }
  return addMonthsToIso(start, dur.count)
}

/**
 * Конец с запасным дефолтом +1 месяц.
 * @param {string} startIso
 * @param {unknown} unit
 * @param {unknown} count
 */
export function membershipPackageEndOrDefaultIso(startIso, unit, count) {
  return membershipPackageEndIso(startIso, unit, count) || defaultMembershipEndIso(startIso)
}

/**
 * Подпись длительности для UI.
 * @param {{ unit?: unknown, count?: unknown } | null | undefined} duration
 */
export function formatMembershipDurationLabel(duration) {
  const dur = normalizeMembershipDuration(duration?.unit, duration?.count)
  if (!dur) return ''
  if (dur.unit === MEMBERSHIP_DURATION_UNIT_DAYS) {
    const n = dur.count
    if (n === 1) return '1 день'
    if (n >= 2 && n <= 4) return `${n} дня`
    return `${n} дн.`
  }
  if (dur.count === 1.5) return '1.5 мес.'
  const n = dur.count
  if (n === 1) return '1 месяц'
  if (n >= 2 && n <= 4) return `${n} месяца`
  return `${n} мес.`
}

/**
 * Значение select пресета из unit/count.
 * @param {unknown} unit
 * @param {unknown} count
 */
export function membershipDurationPresetValue(unit, count) {
  const dur = normalizeMembershipDuration(unit, count)
  if (!dur) return '1'
  if (dur.unit === MEMBERSHIP_DURATION_UNIT_DAYS) return MEMBERSHIP_DURATION_PRESET_CUSTOM
  if (dur.count === 1.5) return '1.5'
  return String(dur.count)
}

/**
 * Разбор значения select пресета → unit/count.
 * @param {string} preset
 * @param {unknown} customDays
 * @returns {{ unit: 'months'|'days', count: number } | null}
 */
export function membershipDurationFromPreset(preset, customDays) {
  const p = String(preset ?? '')
  if (p === MEMBERSHIP_DURATION_PRESET_CUSTOM) {
    return normalizeMembershipDuration(MEMBERSHIP_DURATION_UNIT_DAYS, customDays)
  }
  if (p === '1.5') return normalizeMembershipDuration(MEMBERSHIP_DURATION_UNIT_MONTHS, 1.5)
  const months = Number(p)
  return normalizeMembershipDuration(MEMBERSHIP_DURATION_UNIT_MONTHS, months)
}

/**
 * Снимок длительности с строки абона (или null).
 * @param {object | null | undefined} membership
 */
export function readMembershipDurationSnapshot(membership) {
  return normalizeMembershipDuration(membership?.duration_unit, membership?.duration_count)
}

/**
 * Если длительности нет — вывести дни из дат (ручной конец / legacy).
 * @param {string} startIso
 * @param {string} endIso
 */
export function inferMembershipDurationDays(startIso, endIso) {
  const days = inclusiveCalendarDaysBetween(startIso, endIso)
  if (!days || days < 1) return null
  return normalizeMembershipDuration(MEMBERSHIP_DURATION_UNIT_DAYS, days)
}

/**
 * Конец при сдвиге старта: по снимку длительности или legacy (та же длина в днях).
 * @param {object | null | undefined} membership
 * @param {string} newStartIso
 * @returns {string} end iso or ''
 */
export function membershipShiftEndIso(membership, newStartIso) {
  const start = String(newStartIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return ''
  const snap = readMembershipDurationSnapshot(membership)
  if (snap) {
    return membershipPackageEndIso(start, snap.unit, snap.count)
  }
  const fromStart = String(membership?.start_date ?? '').slice(0, 10)
  const fromEnd = String(membership?.end_date ?? '').slice(0, 10)
  const periodDays = inclusiveCalendarDaysBetween(fromStart, fromEnd)
  if (!periodDays || periodDays < 1) return ''
  return addCalendarDaysIso(start, periodDays - 1)
}
