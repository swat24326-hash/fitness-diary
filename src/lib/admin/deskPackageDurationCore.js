/**
 * Срок desk-пакета: дни или месяцы → даты начала/конца.
 * В БД единица не хранится — только start_date / end_date.
 */

import { membershipPeriodDayCount } from '../membershipRules.js'
import { addCalendarDaysIso, addMonthsToIso } from '../dateRu.js'

export const DESK_PACKAGE_UNIT_DAYS = 'days'
export const DESK_PACKAGE_UNIT_MONTHS = 'months'

/** Пресеты дней (разовое / неделя / две). */
export const DESK_PACKAGE_DAY_OPTIONS = [1, 7, 14]

/** Варианты пакета как в прайсе: месяц, два… */
export const DESK_PACKAGE_MONTH_OPTIONS = [1, 2, 3, 6, 12]

export const DESK_PACKAGE_DAYS_MAX = 90
export const DESK_PACKAGE_MONTHS_MAX = 36

/** Sentinel UI: пункт «Другое…». */
export const DESK_PACKAGE_COUNT_CUSTOM = '__custom__'

/**
 * @param {unknown} unit
 * @returns {'days'|'months'}
 */
export function normalizeDeskPackageUnit(unit) {
  return String(unit ?? '') === DESK_PACKAGE_UNIT_DAYS
    ? DESK_PACKAGE_UNIT_DAYS
    : DESK_PACKAGE_UNIT_MONTHS
}

/**
 * @param {'days'|'months'|string} unit
 */
export function deskPackageCountMax(unit) {
  return normalizeDeskPackageUnit(unit) === DESK_PACKAGE_UNIT_DAYS
    ? DESK_PACKAGE_DAYS_MAX
    : DESK_PACKAGE_MONTHS_MAX
}

/**
 * Конец пакета: старт + N календарных месяцев, последний день включён (20.02 → 20.08 при 6 мес).
 * @param {string} startIso
 * @param {number} months
 */
export function deskPackageEndIso(startIso, months) {
  const start = String(startIso ?? '').slice(0, 10)
  const n = Math.trunc(Number(months))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !(n > 0)) return ''
  return addMonthsToIso(start, n)
}

/**
 * Старт пакета по дате окончания и числу месяцев (обратно к deskPackageEndIso).
 * @param {string} endIso
 * @param {number} months
 */
export function deskPackageStartIso(endIso, months) {
  const end = String(endIso ?? '').slice(0, 10)
  const n = Math.trunc(Number(months))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !(n > 0)) return ''
  return addMonthsToIso(end, -n)
}

/**
 * Конец пакета по единице и числу. 1 день → тот же календарный день.
 * @param {string} startIso
 * @param {unknown} unit
 * @param {unknown} count
 */
export function deskPackageEndByDuration(startIso, unit, count) {
  const start = String(startIso ?? '').slice(0, 10)
  const n = Math.trunc(Number(count))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !(n > 0)) return ''
  if (normalizeDeskPackageUnit(unit) === DESK_PACKAGE_UNIT_DAYS) {
    return addCalendarDaysIso(start, n - 1)
  }
  return deskPackageEndIso(start, n)
}

function ruCountWord(n, one, few, many) {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few
  return many
}

/**
 * @param {number|null|undefined} months
 */
export function formatDeskPackageMonthsLabel(months) {
  const n = Math.trunc(Number(months) || 0)
  if (!(n > 0)) return '—'
  if (n === 1) return '1 месяц'
  if (n < 5) return `${n} месяца`
  return `${n} месяцев`
}

/**
 * @param {number|null|undefined} days
 */
export function formatDeskPackageDaysLabel(days) {
  const n = Math.trunc(Number(days) || 0)
  if (!(n > 0)) return '—'
  return `${n} ${ruCountWord(n, 'день', 'дня', 'дней')}`
}

/**
 * @param {{ unit?: unknown, count?: unknown }|null|undefined} duration
 */
export function formatDeskPackageDurationLabel(duration) {
  const n = Math.trunc(Number(duration?.count) || 0)
  if (!(n > 0)) return '—'
  if (normalizeDeskPackageUnit(duration?.unit) === DESK_PACKAGE_UNIT_DAYS) {
    return formatDeskPackageDaysLabel(n)
  }
  return formatDeskPackageMonthsLabel(n)
}

/**
 * Угадать срок по датам: сначала точный месяц, иначе дни (включительно).
 * Не округляет 1 день до «1 месяц».
 * @param {string} startIso
 * @param {string} endIso
 * @returns {{ unit: 'days'|'months', count: number }|null}
 */
export function inferDeskPackageDuration(startIso, endIso) {
  const start = String(startIso ?? '').slice(0, 10)
  const end = String(endIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
    return null
  }
  for (let n = 1; n <= 24; n++) {
    if (deskPackageEndIso(start, n) === end) {
      return { unit: DESK_PACKAGE_UNIT_MONTHS, count: n }
    }
  }
  const days = membershipPeriodDayCount({ start_date: start, end_date: end })
  if (!(days > 0)) return null
  if (days <= DESK_PACKAGE_DAYS_MAX) {
    return { unit: DESK_PACKAGE_UNIT_DAYS, count: days }
  }
  // Длинный срок без точного месяца — не «91 день» (поле «Другое» режет >90).
  return { unit: DESK_PACKAGE_UNIT_MONTHS, count: Math.max(1, Math.round(days / 30)) }
}

/**
 * Только точное совпадение с календарными месяцами (без days/30).
 * @param {string} startIso
 * @param {string} endIso
 * @returns {number|null}
 */
export function inferDeskPackageMonths(startIso, endIso) {
  const d = inferDeskPackageDuration(startIso, endIso)
  return d?.unit === DESK_PACKAGE_UNIT_MONTHS ? d.count : null
}

/**
 * @param {unknown} unit
 * @param {unknown} count
 */
export function isDeskPackageCountPreset(unit, count) {
  const n = Number(count)
  if (!Number.isFinite(n)) return false
  const list =
    normalizeDeskPackageUnit(unit) === DESK_PACKAGE_UNIT_DAYS
      ? DESK_PACKAGE_DAY_OPTIONS
      : DESK_PACKAGE_MONTH_OPTIONS
  return list.includes(n)
}

/**
 * Разбор числа срока. Пусто / мусор → null.
 * @param {unknown} unit
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseDeskPackageCount(unit, raw) {
  if (raw === DESK_PACKAGE_COUNT_CUSTOM) return null
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s || s === DESK_PACKAGE_COUNT_CUSTOM) return null
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const t = Math.trunc(n)
  const max = deskPackageCountMax(unit)
  if (t < 1 || t > max) return null
  return t
}

/**
 * Значение `<select>` числа: пресет или «Другое».
 * @param {unknown} unit
 * @param {unknown} count
 * @param {boolean} [forceCustom]
 */
export function deskPackageCountSelectValue(unit, count, forceCustom = false) {
  if (forceCustom) return DESK_PACKAGE_COUNT_CUSTOM
  if (count == null || count === '') return DESK_PACKAGE_COUNT_CUSTOM
  if (isDeskPackageCountPreset(unit, count)) return String(Number(count))
  return DESK_PACKAGE_COUNT_CUSTOM
}

/**
 * Срок готов (есть валидное число).
 * @param {unknown} unit
 * @param {unknown} count
 */
export function isDeskPackageDurationReady(unit, count) {
  return parseDeskPackageCount(unit, count) != null
}

/**
 * Тариф разового посещения (1С: «разовое ТЗ», «разовый визит»).
 * Не путать с «многоразовый».
 * @param {unknown} tariffName
 */
export function isOneTimeTariffName(tariffName) {
  const t = String(tariffName ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
  if (!t.trim()) return false
  if (/многоразов/.test(t)) return false
  return /разовое|разовый|разовая|разовые/.test(t)
}
