/**
 * Когорты retention: anchor month → engaged M+N.
 */

import { clientEngagedInRange, resolveCohortAnchorDate } from './clientRetentionCore.js'
import { isClientInRetentionPool, isClientInRetentionUniverse } from './clientRetentionPoolCore.js'

/**
 * @param {string} iso yyyy-mm-dd
 * @returns {string|null} yyyy-mm
 */
export function monthKeyFromIso(iso) {
  const d = String(iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d.slice(0, 7)
}

/**
 * @param {string} monthKey yyyy-mm
 * @param {number} deltaMonths
 * @returns {string|null}
 */
export function addMonthsToMonthKey(monthKey, deltaMonths) {
  const m = String(monthKey ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(m)) return null
  const [y, mo] = m.split('-').map(Number)
  let month = mo + deltaMonths
  let year = y
  while (month > 12) {
    month -= 12
    year += 1
  }
  while (month < 1) {
    month += 12
    year -= 1
  }
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * @param {string} monthKey yyyy-mm
 * @returns {{ from: string, to: string }|null}
 */
export function calendarMonthRange(monthKey) {
  const key = String(monthKey ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(key)) return null
  const [y, mo] = key.split('-').map(Number)
  const from = `${y}-${String(mo).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const to = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

/**
 * @typedef {{ clientId: string, anchorDate: string, anchorMonth: string, anchorTrainerId: string }} CohortMember
 */

/**
 * @param {object[]} clients — active pool или universe (с archived для истории когорт)
 * @param {Map<string, object[]>} membershipsByClient
 * @param {object[]} membershipTypes
 * @param {{ holdingTrainerIds?: Set<string>|string[], noTabletTrainerIds?: Set<string>|string[], useUniverse?: boolean }} [poolOpts]
 * @returns {CohortMember[]}
 */
export function buildCohortMembers(clients, membershipsByClient, membershipTypes, poolOpts = {}) {
  /** @type {CohortMember[]} */
  const out = []
  const useUniverse = poolOpts.useUniverse === true
  for (const client of clients ?? []) {
    const inPool = useUniverse
      ? isClientInRetentionUniverse(client, poolOpts)
      : isClientInRetentionPool(client, poolOpts)
    if (!inPool) continue
    const id = String(client?.id ?? '').trim()
    if (!id) continue
    const memList = membershipsByClient.get(id) ?? []
    const anchorDate = resolveCohortAnchorDate(client, memList, membershipTypes)
    const anchorMonth = anchorDate ? monthKeyFromIso(anchorDate) : null
    if (!anchorDate || !anchorMonth) continue
    out.push({
      clientId: id,
      anchorDate,
      anchorMonth,
      anchorTrainerId: String(client?.trainer_id ?? '').trim(),
    })
  }
  return out
}

export function resolveRetentionCohortMonths(periodTo, maxMonths = 6) {
  const endMonth = monthKeyFromIso(periodTo)
  if (!endMonth) return []
  /** @type {string[]} */
  const months = []
  let cur = endMonth
  for (let i = 0; i < maxMonths; i++) {
    months.unshift(cur)
    const prev = addMonthsToMonthKey(cur, -1)
    if (!prev) break
    cur = prev
  }
  return months
}

/**
 * @param {string[]} cohortMonths
 * @param {number} [monthsAhead]
 */
export function resolveRetentionTrainingBounds(cohortMonths, monthsAhead = 3) {
  let trainFrom = null
  let trainTo = null
  for (const m of cohortMonths ?? []) {
    const cohortRange = calendarMonthRange(m)
    const targetMonth = addMonthsToMonthKey(m, monthsAhead)
    const targetRange = targetMonth ? calendarMonthRange(targetMonth) : null
    if (cohortRange?.from && (!trainFrom || cohortRange.from < trainFrom)) trainFrom = cohortRange.from
    if (targetRange?.to && (!trainTo || targetRange.to > trainTo)) trainTo = targetRange.to
  }
  return { trainFrom, trainTo }
}

/**
 * Когорта созрела для M+N: конец целевого месяца ≤ asOf.
 * @param {string} cohortMonth yyyy-mm
 * @param {number} monthsAhead
 * @param {string} asOf yyyy-mm-dd
 */
export function isCohortMatureForMN(cohortMonth, monthsAhead, asOf) {
  const targetMonth = addMonthsToMonthKey(cohortMonth, monthsAhead)
  const range = targetMonth ? calendarMonthRange(targetMonth) : null
  const ref = String(asOf ?? '').slice(0, 10)
  if (!range || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) return false
  return range.to <= ref
}

/**
 * @param {CohortMember[]} members
 * @param {object[]} trainings
 * @param {string} cohortMonth yyyy-mm
 * @param {number} monthsAhead
 * @param {string} [asOf] если задан — не считаем незрелые когорты (rate = null)
 */
export function computeCohortRetentionRate(members, trainings, cohortMonth, monthsAhead, asOf = null) {
  const cohort = (members ?? []).filter((m) => m.anchorMonth === cohortMonth)
  if (!cohort.length) return { rate: null, cohortSize: 0, retained: 0, targetMonth: null, mature: false }
  const targetMonth = addMonthsToMonthKey(cohortMonth, monthsAhead)
  if (asOf && targetMonth && !isCohortMatureForMN(cohortMonth, monthsAhead, asOf)) {
    return { rate: null, cohortSize: cohort.length, retained: 0, targetMonth, mature: false }
  }
  const range = targetMonth ? calendarMonthRange(targetMonth) : null
  if (!range) return { rate: null, cohortSize: cohort.length, retained: 0, targetMonth, mature: false }
  let retained = 0
  for (const m of cohort) {
    if (clientEngagedInRange(trainings, m.clientId, range.from, range.to)) retained += 1
  }
  return {
    rate: retained / cohort.length,
    cohortSize: cohort.length,
    retained,
    targetMonth,
    mature: true,
  }
}

/**
 * @param {CohortMember[]} members
 * @param {object[]} trainings
 * @param {string[]} cohortMonths
 * @param {number} [monthsAhead]
 * @param {string} [asOf] yyyy-mm-dd — пропуск незрелых когорт
 */
export function computeAverageRetentionMN(members, trainings, cohortMonths, monthsAhead = 3, asOf = null) {
  let totalCohort = 0
  let totalRetained = 0
  /** @type {string[]} */
  const matureMonths = []
  for (const month of cohortMonths ?? []) {
    const r = computeCohortRetentionRate(members, trainings, month, monthsAhead, asOf)
    if (r.cohortSize > 0 && r.rate != null && r.mature !== false) {
      matureMonths.push(month)
      totalCohort += r.cohortSize
      totalRetained += r.retained
    }
  }
  if (!matureMonths.length || totalCohort === 0) {
    return {
      averageRate: null,
      cohortSize: 0,
      retained: 0,
      cohortMonths: matureMonths,
    }
  }
  return {
    averageRate: totalRetained / totalCohort,
    cohortSize: totalCohort,
    retained: totalRetained,
    cohortMonths: matureMonths,
  }
}

/**
 * @param {CohortMember[]} members
 * @param {object[]} trainings
 * @param {string[]} cohortMonths
 * @param {string} trainerId
 * @param {number} [monthsAhead]
 */
export function computeTrainerRetentionMN(members, trainings, cohortMonths, trainerId, monthsAhead = 3, asOf = null) {
  const tid = String(trainerId ?? '').trim()
  const filtered = (members ?? []).filter((m) => m.anchorTrainerId === tid)
  return computeAverageRetentionMN(filtered, trainings, cohortMonths, monthsAhead, asOf)
}
