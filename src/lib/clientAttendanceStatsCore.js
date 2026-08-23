/**
 * Посещаемость клиента: завершённые тренировки → недели/месяцы, gaps, метка регулярности.
 * Чистая логика без React/IDB.
 */

import { daysSinceIsoDate } from './trainer/trainerClientOutreachCore.js'
import { isTrainingStatusCompleted } from './trainingPersistStatusCore.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** @typedef {'week' | 'month'} AttendanceBucketKind */
/** @typedef {'regular' | 'moderate' | 'rare' | 'none' | 'insufficient'} AttendanceRegularity */

/**
 * @param {string} iso
 * @returns {Date | null}
 */
function parseIsoLocal(iso) {
  const s = String(iso ?? '').slice(0, 10)
  if (!ISO_DATE.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * @param {Date} dt
 * @returns {string}
 */
function fmtLocal(dt) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {string} iso
 * @returns {string | null}
 */
export function isoWeekStartMonday(iso) {
  const dt = parseIsoLocal(iso)
  if (!dt) return null
  const dow = dt.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  dt.setDate(dt.getDate() + diff)
  return fmtLocal(dt)
}

/**
 * @param {string} iso
 * @returns {string | null}
 */
export function isoMonthStart(iso) {
  const s = String(iso ?? '').slice(0, 10)
  if (!ISO_DATE.test(s)) return null
  return `${s.slice(0, 7)}-01`
}

/**
 * @param {string} startIso
 * @param {number} days
 * @returns {string | null}
 */
function addDaysIso(startIso, days) {
  const dt = parseIsoLocal(startIso)
  if (!dt) return null
  dt.setDate(dt.getDate() + days)
  return fmtLocal(dt)
}

/**
 * @param {string} startIso
 * @returns {string | null}
 */
function nextMonthStartIso(startIso) {
  const dt = parseIsoLocal(startIso)
  if (!dt) return null
  dt.setMonth(dt.getMonth() + 1, 1)
  return fmtLocal(dt)
}

/**
 * @param {string} startIso
 * @param {string} endIso
 * @returns {number}
 */
export function daysInIsoRangeInclusive(startIso, endIso) {
  const from = String(startIso ?? '').slice(0, 10)
  const to = String(endIso ?? '').slice(0, 10)
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return 0
  const d = daysSinceIsoDate(from, to)
  return d != null && d >= 0 ? d + 1 : 0
}

/** До этого числа недель — группировка по неделям (видны пропуски); длиннее — по месяцам. */
export const ATTENDANCE_MAX_WEEK_BUCKETS = 26

/**
 * @param {string} startIso
 * @param {string} endIso
 * @returns {AttendanceBucketKind}
 */
export function resolveAttendanceBucketKind(startIso, endIso) {
  const from = String(startIso ?? '').slice(0, 10)
  const to = String(endIso ?? '').slice(0, 10)
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return 'week'
  const weekBuckets = buildAttendanceBucketRanges(from, to, 'week')
  return weekBuckets.length <= ATTENDANCE_MAX_WEEK_BUCKETS ? 'week' : 'month'
}

/**
 * Окно недель для torn/trend: не длиннее ATTENDANCE_MAX_WEEK_BUCKETS, конец = dateTo.
 * @param {string} dateFrom
 * @param {string} dateTo
 */
export function resolveAttendanceRhythmWeekFrom(dateFrom, dateTo) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!ISO_DATE.test(to)) return from
  const maxFrom = addDaysIso(to, -(ATTENDANCE_MAX_WEEK_BUCKETS * 7 - 1))
  if (!maxFrom) return from
  if (ISO_DATE.test(from) && from > maxFrom) return from
  return maxFrom
}

/**
 * @param {string} startIso
 * @param {string} endIso
 * @returns {string}
 */
export function formatBucketLabelRu(startIso, endIso) {
  const s = parseIsoLocal(startIso)
  const e = parseIsoLocal(endIso)
  if (!s || !e) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()

  if (sameMonth) {
    return `${pad(s.getDate())}–${pad(e.getDate())}.${pad(s.getMonth() + 1)}${sameYear ? '' : `.${String(s.getFullYear()).slice(-2)}`}`
  }
  if (sameYear) {
    return `${pad(s.getDate())}.${pad(s.getMonth() + 1)}–${pad(e.getDate())}.${pad(e.getMonth() + 1)}`
  }
  return `${pad(s.getDate())}.${pad(s.getMonth() + 1)}.${String(s.getFullYear()).slice(-2)}–${pad(e.getDate())}.${pad(e.getMonth() + 1)}.${String(e.getFullYear()).slice(-2)}`
}

/**
 * @param {string} monthStartIso YYYY-MM-01
 * @returns {string | null}
 */
function monthEndIso(monthStartIso) {
  const dt = parseIsoLocal(monthStartIso)
  if (!dt) return null
  dt.setMonth(dt.getMonth() + 1, 0)
  return fmtLocal(dt)
}

/**
 * @param {string} bucketStart
 * @param {AttendanceBucketKind} kind
 * @returns {string | null}
 */
function bucketNaturalEnd(bucketStart, kind) {
  if (kind === 'week') return addDaysIso(bucketStart, 6)
  return monthEndIso(bucketStart)
}

/**
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {AttendanceBucketKind} kind
 * @returns {Array<{ start: string, end: string, labelRu: string }>}
 */
export function buildAttendanceBucketRanges(dateFrom, dateTo, kind) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return []

  let cursor = kind === 'week' ? isoWeekStartMonday(from) : isoMonthStart(from)
  if (!cursor) return []

  /** @type {Array<{ start: string, end: string, labelRu: string }>} */
  const out = []
  let guard = 0
  while (cursor <= to && guard < 500) {
    guard++
    const naturalEnd = bucketNaturalEnd(cursor, kind)
    if (!naturalEnd) break
    const clippedStart = cursor < from ? from : cursor
    const clippedEnd = naturalEnd > to ? to : naturalEnd
    if (clippedStart <= clippedEnd) {
      out.push({
        start: clippedStart,
        end: clippedEnd,
        labelRu: formatBucketLabelRu(clippedStart, clippedEnd),
      })
    }
    cursor = kind === 'week' ? addDaysIso(cursor, 7) : nextMonthStartIso(cursor)
    if (!cursor) break
  }
  return out
}

/**
 * @param {object[]} trainings
 * @returns {Array<{ id: string, date: string }>}
 */
export function listCompletedVisitDates(trainings) {
  const seen = new Set()
  /** @type {Array<{ id: string, date: string }>} */
  const out = []
  for (const t of trainings ?? []) {
    if (!isTrainingStatusCompleted(t?.status)) continue
    const date = String(t?.date ?? '').slice(0, 10)
    if (!ISO_DATE.test(date)) continue
    const id = String(t?.id ?? `${date}:${out.length}`)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, date })
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  return out
}

/**
 * @param {string[]} sortedDates
 * @returns {number | null}
 */
export function maxGapDaysBetween(sortedDates) {
  const dates = (sortedDates ?? []).filter((d) => ISO_DATE.test(String(d).slice(0, 10)))
  if (dates.length < 2) return null
  let max = 0
  for (let i = 1; i < dates.length; i++) {
    const gap = daysSinceIsoDate(dates[i - 1], dates[i])
    if (gap != null && gap > max) max = gap
  }
  return max
}

/**
 * Макс. перерыв внутри периода: от gapFrom (или dateFrom) до первого визита,
 * между визитами, от последнего до dateTo.
 * gapFrom — старт учёта пауз (обычно max(dateFrom, membership.start_date)),
 * чтобы тишина до начала абона не считалась «длинным перерывом».
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {string[]} sortedDates
 * @param {{ gapFrom?: string }} [opts]
 * @returns {number | null}
 */
export function maxGapDaysInPeriod(dateFrom, dateTo, sortedDates, opts = {}) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return null

  let gapFrom = String(opts.gapFrom ?? from).slice(0, 10)
  if (!ISO_DATE.test(gapFrom) || gapFrom < from) gapFrom = from
  if (gapFrom > to) gapFrom = from

  const dates = (sortedDates ?? [])
    .map((d) => String(d).slice(0, 10))
    .filter((d) => ISO_DATE.test(d) && d >= from && d <= to)
    .sort()

  if (!dates.length) return null

  let max = 0
  const firstInGap = dates.find((d) => d >= gapFrom) ?? dates[0]
  const lead = daysSinceIsoDate(gapFrom, firstInGap)
  if (lead != null && lead > max) max = lead

  for (let i = 1; i < dates.length; i++) {
    const gap = daysSinceIsoDate(dates[i - 1], dates[i])
    if (gap != null && gap > max) max = gap
  }

  const tail = daysSinceIsoDate(dates[dates.length - 1], to)
  if (tail != null && tail > max) max = tail

  return max
}

/**
 * Дней от последнего визита в периоде до dateTo (включительно).
 * @param {string[]} sortedDates
 * @param {string} dateTo
 * @returns {number | null}
 */
export function daysSinceLastVisitInPeriod(sortedDates, dateTo) {
  const to = String(dateTo ?? '').slice(0, 10)
  if (!ISO_DATE.test(to)) return null
  const dates = (sortedDates ?? [])
    .map((d) => String(d).slice(0, 10))
    .filter((d) => ISO_DATE.test(d) && d <= to)
    .sort()
  if (!dates.length) return null
  const gap = daysSinceIsoDate(dates[dates.length - 1], to)
  return gap != null && gap >= 0 ? gap : null
}

/** Подпись ячейки «Даты» для пустого периода. */
export const ATTENDANCE_MISSED_LABEL_RU = 'Не посещал'

/**
 * @param {string[]} dates
 * @param {(iso: string) => string} formatDateRu
 * @returns {string}
 */
export function formatAttendanceBucketDatesCellRu(dates, formatDateRu) {
  if (!dates?.length) return ATTENDANCE_MISSED_LABEL_RU
  return formatGroupedVisitDatesRu(dates, formatDateRu)
}

/**
 * Подпись оси X: диапазон недели/месяца; при >14 периодов — номер, диапазон в tooltip.
 * @param {Array<{ index: number, labelRu: string }>} buckets
 * @param {AttendanceBucketKind} kind
 * @returns {string[]}
 */
export function buildAttendanceChartAxisLabels(buckets, kind) {
  const list = buckets ?? []
  const compact = list.length > 14
  if (!compact) return list.map((b) => String(b.labelRu ?? '—'))
  const prefix = kind === 'month' ? 'М' : 'Н'
  return list.map((b) => `${prefix}${b.index ?? '?'}`)
}

/**
 * @param {{ index: number, labelRu: string }} bucket
 * @param {AttendanceBucketKind} kind
 * @returns {string}
 */
export function formatAttendanceBucketTablePeriodRu(bucket, kind) {
  const idx = Number(bucket?.index) || 0
  const range = String(bucket?.labelRu ?? '—')
  if (idx <= 0) return range
  const prefix = kind === 'month' ? 'Мес.' : 'Нед.'
  return `${prefix} ${idx} · ${range}`
}

/**
 * Группировка дат визитов для таблицы: «15.07.2026 (×2)» при двух тренировках в день.
 * @param {string[]} dates ISO YYYY-MM-DD
 * @param {(iso: string) => string} formatDateRu
 * @returns {string}
 */
export function formatGroupedVisitDatesRu(dates, formatDateRu) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const raw of dates ?? []) {
    const d = String(raw ?? '').slice(0, 10)
    if (!ISO_DATE.test(d)) continue
    counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  const sorted = [...counts.keys()].sort()
  if (!sorted.length) return '—'
  return sorted
    .map((d) => {
      const n = counts.get(d) ?? 1
      const label = formatDateRu(d)
      return n > 1 ? `${label} (×${n})` : label
    })
    .join(', ')
}

export const ATTENDANCE_NORMA_MIN_VISITS_PER_WEEK = 1
export const ATTENDANCE_REGULAR_MIN_VISITS_PER_WEEK = 1.5
export const ATTENDANCE_REGULAR_MAX_GAP_DAYS = 14

/**
 * @param {{
 *   visitsPerWeek: number,
 *   maxGapDays: number | null,
 *   daysSinceLastVisit?: number | null,
 *   total: number,
 *   daysInRange: number,
 * }} p
 * @returns {AttendanceRegularity}
 */
export function resolveAttendanceRegularity(p) {
  const total = Number(p.total) || 0
  const days = Number(p.daysInRange) || 0
  if (total <= 0) return 'none'
  if (days < ATTENDANCE_REGULAR_MAX_GAP_DAYS || total < 2) return 'insufficient'

  const avg = Number(p.visitsPerWeek) || 0
  const maxGap = p.maxGapDays
  const tail = p.daysSinceLastVisit
  // Норма = ≥1/нед; Регулярно = ≥1.5/нед без пауз ≥14 дн. (пауза 14 = уже slip).
  const gapOk =
    (maxGap == null || maxGap < ATTENDANCE_REGULAR_MAX_GAP_DAYS) &&
    (tail == null || tail < ATTENDANCE_REGULAR_MAX_GAP_DAYS)
  if (avg >= ATTENDANCE_REGULAR_MIN_VISITS_PER_WEEK && gapOk) return 'regular'
  if (avg >= ATTENDANCE_NORMA_MIN_VISITS_PER_WEEK) return 'moderate'
  return 'rare'
}

/** @param {AttendanceRegularity} kind */
export function attendanceRegularityLabelRu(kind) {
  if (kind === 'regular') return 'Регулярно'
  if (kind === 'moderate') return 'Норма'
  if (kind === 'rare') return 'Редко'
  if (kind === 'insufficient') return 'Мало данных за период'
  return 'Нет визитов'
}

/**
 * @param {object[]} trainings
 * @param {{ dateFrom: string, dateTo: string, gapFrom?: string, forceBucketKind?: AttendanceBucketKind }} opts
 */
export function buildClientAttendanceStats(trainings, opts) {
  const dateFrom = String(opts?.dateFrom ?? '').slice(0, 10)
  const dateTo = String(opts?.dateTo ?? '').slice(0, 10)
  const daysInRange = daysInIsoRangeInclusive(dateFrom, dateTo)

  if (!ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo) || dateFrom > dateTo || daysInRange <= 0) {
    return {
      visits: [],
      summary: {
        total: 0,
        visitsPerWeek: 0,
        maxGapDays: null,
        daysSinceLastVisit: null,
        regularity: /** @type {AttendanceRegularity} */ ('none'),
        regularityLabelRu: attendanceRegularityLabelRu('none'),
      },
      bucketKind: /** @type {AttendanceBucketKind} */ ('week'),
      buckets: [],
    }
  }

  const allVisits = listCompletedVisitDates(trainings)
  const visits = allVisits.filter((v) => v.date >= dateFrom && v.date <= dateTo)
  const dates = visits.map((v) => v.date)
  const total = visits.length
  // Темп и регулярность — с gapFrom (старт абона), иначе новичок в длинном окне выглядит «Редко».
  let engagementFrom = dateFrom
  const gapFromRaw = String(opts?.gapFrom ?? '').slice(0, 10)
  if (ISO_DATE.test(gapFromRaw) && gapFromRaw > dateFrom && gapFromRaw <= dateTo) {
    engagementFrom = gapFromRaw
  }
  const engagementDays = daysInIsoRangeInclusive(engagementFrom, dateTo)
  const weekDivisor = Math.max(1, engagementDays / 7)
  const visitsPerWeek = Math.round((total / weekDivisor) * 10) / 10
  const maxGapDays = maxGapDaysInPeriod(dateFrom, dateTo, dates, { gapFrom: engagementFrom })
  const daysSinceLastVisit = daysSinceLastVisitInPeriod(dates, dateTo)
  const regularity = resolveAttendanceRegularity({
    visitsPerWeek,
    maxGapDays,
    daysSinceLastVisit,
    total,
    daysInRange: engagementDays,
  })
  const forced = opts?.forceBucketKind
  const bucketKind =
    forced === 'week' || forced === 'month' ? forced : resolveAttendanceBucketKind(dateFrom, dateTo)
  const ranges = buildAttendanceBucketRanges(dateFrom, dateTo, bucketKind)

  const buckets = ranges.map((r, i) => {
    const inBucket = visits.filter((v) => v.date >= r.start && v.date <= r.end)
    const count = inBucket.length
    return {
      index: i + 1,
      start: r.start,
      end: r.end,
      labelRu: r.labelRu,
      count,
      dates: inBucket.map((v) => v.date),
      visited: count > 0,
    }
  })

  return {
    visits,
    summary: {
      total,
      visitsPerWeek,
      maxGapDays,
      daysSinceLastVisit,
      regularity,
      regularityLabelRu: attendanceRegularityLabelRu(regularity),
    },
    bucketKind,
    buckets,
  }
}
