/**
 * Помесячные серии для вкладки «Итог»: посещаемость и M+3 за календарный год.
 * Объём (typed completed) остаётся в clubMonthlyAgg / adminClubMonthlyService.
 */

import { ATTENDANCE_GLANCE_WINDOW_DAYS } from '../clientAttendanceGlanceCore.js'
import { addDaysToIso, clampIsoDateToToday } from '../dateRu.js'
import { aggregateClubAttendance } from './clubAttendanceAggCore.js'
import {
  buildCohortMembers,
  calendarMonthRange,
  computeAverageRetentionMN,
  resolveRetentionCohortMonths,
  resolveRetentionTrainingBounds,
} from './clientRetentionCohortCore.js'
import { indexMembershipsByClient } from './clientRetentionCore.js'
import { filterRetentionUniverseClients } from './clientRetentionPoolCore.js'
/** @typedef {'volume' | 'attendance' | 'retentionM3'} ClubMonthlyMetricId */

/** @param {number} year */
function buildCalendarYearMonthKeys(year) {
  const y = Number(year)
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return []
  const out = []
  for (let m = 1; m <= 12; m++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return out
}

/**
 * @param {string} monthKey yyyy-mm
 * @param {string} todayIso yyyy-mm-dd
 * @returns {string | null} asOf для месяца или null если месяц ещё не начался
 */
export function resolveMonthSeriesAsOf(monthKey, todayIso) {
  const mk = String(monthKey ?? '').trim()
  const today = String(todayIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}$/.test(mk) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  const todayMonth = today.slice(0, 7)
  if (mk > todayMonth) return null
  const range = calendarMonthRange(mk)
  if (!range) return null
  if (mk === todayMonth) return today
  return range.to
}

/**
 * Нижняя граница тренировок для серий года (посещаемость + M+3).
 * @param {number} year
 * @param {string} [todayIso]
 */
export function resolveClubMonthlySeriesTrainingFrom(year, todayIso) {
  const y = Number(year)
  if (!Number.isFinite(y)) return null
  const yearStart = `${y}-01-01`
  const attFrom = addDaysToIso(yearStart, -Math.max(90, ATTENDANCE_GLANCE_WINDOW_DAYS + 14))
  const endAsOf = resolveMonthSeriesAsOf(`${y}-12`, todayIso || `${y}-12-31`) || `${y}-12-31`
  const cohortMonths = resolveRetentionCohortMonths(endAsOf, 6)
  // Для января тоже нужны когорты — берём нижнюю границу по январскому asOf.
  const janAsOf = resolveMonthSeriesAsOf(`${y}-01`, todayIso || `${y}-01-31`)
  if (janAsOf) {
    const janCohorts = resolveRetentionCohortMonths(janAsOf, 6)
    for (const m of janCohorts) {
      if (!cohortMonths.includes(m)) cohortMonths.unshift(m)
    }
  }
  const { trainFrom } = resolveRetentionTrainingBounds(cohortMonths, 3)
  if (!attFrom) return trainFrom
  if (!trainFrom) return attFrom
  return attFrom < trainFrom ? attFrom : trainFrom
}

/**
 * @param {{
 *   clients?: object[],
 *   memberships?: object[],
 *   trainings?: object[],
 *   membershipTypes?: object[],
 *   lifecycleRows?: object[],
 *   holdingTrainerIds?: Set<string>|string[],
 *   noTabletTrainerIds?: Set<string>|string[],
 *   year: number,
 *   todayIso: string,
 *   trainerIdFilter?: string | null,
 * }} input
 * @returns {Array<{ month: string, value: number | null }>}
 */
export function aggregateMonthlyAttendanceSeries(input) {
  const year = Number(input.year)
  const todayIso = String(input.todayIso ?? '').slice(0, 10)
  const keys = buildCalendarYearMonthKeys(year)
  if (!keys.length) return []

  const base = {
    clients: input.clients,
    memberships: input.memberships,
    trainings: input.trainings,
    membershipTypes: input.membershipTypes,
    lifecycleRows: input.lifecycleRows,
    holdingTrainerIds: input.holdingTrainerIds,
    noTabletTrainerIds: input.noTabletTrainerIds,
    trainerIdFilter: input.trainerIdFilter ?? null,
    clampAsOf: true,
  }

  return keys.map((month) => {
    const asOf = resolveMonthSeriesAsOf(month, todayIso)
    if (!asOf) return { month, value: null }
    const agg = aggregateClubAttendance({ ...base, dateTo: asOf })
    const v = agg?.avgVisitsPerWeek
    if (v == null || !Number.isFinite(Number(v))) return { month, value: null }
    return { month, value: Math.round(Number(v) * 100) / 100 }
  })
}

/**
 * @param {{
 *   clients?: object[],
 *   memberships?: object[],
 *   trainings?: object[],
 *   membershipTypes?: object[],
 *   lifecycleRows?: object[],
 *   holdingTrainerIds?: Set<string>|string[],
 *   noTabletTrainerIds?: Set<string>|string[],
 *   year: number,
 *   todayIso: string,
 *   trainerIdFilter?: string | null,
 * }} input
 * @returns {Array<{ month: string, value: number | null }>} rate 0…1
 */
export function aggregateMonthlyRetentionM3Series(input) {
  const year = Number(input.year)
  const todayIso = String(input.todayIso ?? '').slice(0, 10)
  const keys = buildCalendarYearMonthKeys(year)
  if (!keys.length) return []

  const holdingTrainerIds = input.holdingTrainerIds
  const noTabletTrainerIds = input.noTabletTrainerIds
  const lifecycleRows = input.lifecycleRows ?? []
  const poolOpts = { holdingTrainerIds, noTabletTrainerIds, lifecycleRows }

  let clients = Array.isArray(input.clients) ? [...input.clients] : []
  const trainerIdFilter = input.trainerIdFilter ? String(input.trainerIdFilter).trim() : ''
  if (trainerIdFilter) {
    clients = clients.filter((c) => String(c?.trainer_id ?? '') === trainerIdFilter)
  }

  const universe = filterRetentionUniverseClients(clients, poolOpts)
  const membershipsByClient = indexMembershipsByClient(input.memberships)
  const trainings = input.trainings ?? []
  const membershipTypes = input.membershipTypes ?? []

  const cohortMembers = buildCohortMembers(
    universe,
    membershipsByClient,
    membershipTypes,
    { ...poolOpts, useUniverse: true },
    trainings,
  )

  const members = trainerIdFilter
    ? cohortMembers.filter((m) => m.anchorTrainerId === trainerIdFilter)
    : cohortMembers

  return keys.map((month) => {
    const asOf = resolveMonthSeriesAsOf(month, todayIso)
    if (!asOf) return { month, value: null }
    const cohortMonths = resolveRetentionCohortMonths(asOf, 6)
    const r = computeAverageRetentionMN(members, trainings, cohortMonths, 3, asOf)
    const rate = r?.averageRate
    if (rate == null || !Number.isFinite(Number(rate))) return { month, value: null }
    return { month, value: Number(rate) }
  })
}

/**
 * Объём months[{month,count}] → единый вид {month,value}.
 * @param {Array<{ month?: string, count?: number }>|null|undefined} months
 */
export function volumeRowsToSeries(months) {
  return (Array.isArray(months) ? months : []).map((r) => ({
    month: String(r?.month ?? ''),
    value: Number(r?.count ?? 0) || 0,
  }))
}

/**
 * @param {ClubMonthlyMetricId} metric
 * @param {{
 *   months?: Array<{ month: string, count: number }>,
 *   attendance?: Array<{ month: string, value: number | null }>,
 *   retentionM3?: Array<{ month: string, value: number | null }>,
 * }} payload
 */
export function pickClubMonthlySeries(metric, payload) {
  if (metric === 'attendance') return Array.isArray(payload?.attendance) ? payload.attendance : []
  if (metric === 'retentionM3') return Array.isArray(payload?.retentionM3) ? payload.retentionM3 : []
  return volumeRowsToSeries(payload?.months)
}

/**
 * Значение для оси/подписи: M+3 → проценты 0…100.
 * @param {ClubMonthlyMetricId} metric
 * @param {number | null | undefined} value
 */
export function clubMonthlySeriesDisplayValue(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) return null
  const n = Number(value)
  if (metric === 'retentionM3') return Math.round(n * 1000) / 10
  return n
}

/**
 * @param {ClubMonthlyMetricId} metric
 * @param {number | null | undefined} displayValue
 */
export function formatClubMonthlySeriesValue(metric, displayValue) {
  if (displayValue == null || !Number.isFinite(Number(displayValue))) return '—'
  const n = Number(displayValue)
  if (metric === 'retentionM3') {
    return `${Math.round(n)}%`
  }
  if (metric === 'attendance') {
    return n.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
  }
  return String(Math.round(n))
}

export function clubMonthlySeriesTrainingTo(year, todayIso) {
  const y = Number(year)
  if (!Number.isFinite(y)) return null
  const yearEnd = `${y}-12-31`
  const today = String(todayIso ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(today)) return clampIsoDateToToday(today > yearEnd ? yearEnd : today)
  return yearEnd
}
