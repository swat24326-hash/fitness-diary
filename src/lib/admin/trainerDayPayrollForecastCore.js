/**
 * Дневной прогноз ЗП по матрице тренировок: база (ставки уровня) + итого с надбавкой кабинета.
 * Без плана — факт по ур.3 + сценарии ур.1/2/3 в базе.
 */
import {
  normalizeMatrixRowsFromDb,
  resolveTrainingsMatrixForPersist,
  SALES_TRAINING_CLUB_ID,
} from './salesTrainingsMatrix.js'
import { normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'
import {
  effectiveSessionRate,
  getTrainerPayProfile,
  pickMembershipTypeTierRate,
  resolveTrainerPayLevel,
} from './trainerPayProfileCore.js'
import { membershipTypeCountsTowardPayPlan } from './trainerPayTiersCore.js'
import { sumWorkoutsByTrainerFromMatrixRows } from './trainerPayrollCore.js'

function roundRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * @param {Array<{ id?: string }>} membershipTypes
 * @returns {Map<string, object>}
 */
function indexTypesById(membershipTypes) {
  const map = new Map()
  for (const t of membershipTypes ?? []) {
    const id = String(t?.id ?? '').trim()
    if (id) map.set(id, t)
  }
  return map
}

/**
 * Сумма «база» / «итого» по строкам одного тренера на фиксированном уровне.
 * @param {Array<{ membership_type_id?: string | null, count?: number }>} rows
 * @param {Map<string, object>} typeById
 * @param {1|2|3} level
 * @param {number} adjRub
 * @returns {{ baseRub: number, totalRub: number, payableCount: number }}
 */
export function sumDayPayAtLevel(rows, typeById, level, adjRub = 0) {
  let baseRub = 0
  let totalRub = 0
  let payableCount = 0
  for (const row of rows ?? []) {
    const typeId =
      row.membership_type_id == null || row.membership_type_id === ''
        ? null
        : String(row.membership_type_id).trim()
    if (!typeId) continue
    const typeRow = typeById.get(typeId)
    if (!typeRow) continue
    const countN = Math.trunc(Number(row.count) || 0)
    if (countN <= 0) continue
    const base = pickMembershipTypeTierRate(typeRow, level)
    if (base <= 0) continue
    payableCount += countN
    baseRub = roundRub(baseRub + countN * base)
    totalRub = roundRub(totalRub + countN * effectiveSessionRate(base, adjRub))
  }
  return { baseRub, totalRub, payableCount }
}

/**
 * MTD тренировок «в план»: дни месяца кроме reportDate + строки текущего дня.
 * @param {Array<Record<string, unknown>>} monthRows
 * @param {string} reportDateIso
 * @param {Array<{ trainer_id: string, membership_type_id?: string | null, count?: number }>} dayRows
 * @param {Array<object>} membershipTypes
 * @returns {Map<string, number>}
 */
export function mergeMtdWorkoutsForReportDay(monthRows, reportDateIso, dayRows, membershipTypes) {
  const day = String(reportDateIso ?? '').slice(0, 10)
  const prior = []
  for (const row of monthRows ?? []) {
    const d = String(row?.report_date ?? row?.date ?? '').slice(0, 10)
    if (!d || (day && d === day)) continue
    for (const cell of normalizeMatrixRowsFromDb(row?.trainings_matrix)) {
      // Дни только «По клубу» без разбивки не двигают порог конкретного тренера.
      if (String(cell.trainer_id) === SALES_TRAINING_CLUB_ID) continue
      prior.push(cell)
    }
  }
  const live = (dayRows ?? []).filter((r) => String(r?.trainer_id ?? '') !== SALES_TRAINING_CLUB_ID)
  return sumWorkoutsByTrainerFromMatrixRows([...prior, ...live], membershipTypes)
}

/**
 * @typedef {{
 *   trainerId: string,
 *   onPlan: boolean,
 *   level: 1|2|3,
 *   workoutsMtd: number,
 *   baseRub: number,
 *   totalRub: number,
 *   adjRubPerSession: number,
 *   payableCount: number,
 *   scenarios: { l1: number, l2: number, l3: number } | null,
 * }} TrainerDayPayrollForecast
 */

/**
 * Прогноз ЗП за день по строкам матрицы (уже без __club__ при детализации).
 * @param {{
 *   dayRows: Array<{ trainer_id: string, membership_type_id?: string | null, count?: number }>,
 *   membershipTypes: Array<object>,
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   workoutsByTrainer?: Map<string, number>|null,
 *   clubId?: string,
 * }} input
 * @returns {{
 *   clubBaseRub: number,
 *   clubTotalRub: number,
 *   byTrainer: Map<string, TrainerDayPayrollForecast>,
 * }}
 */
export function computeTrainerDayPayrollForecast(input = {}) {
  const membershipTypes = Array.isArray(input.membershipTypes) ? input.membershipTypes : []
  const typeById = indexTypesById(membershipTypes)
  const planConfig = normalizeTrainerPayPlanConfig(input.planConfig)
  const clubId = String(input.clubId ?? '').trim()
  const dayRows = (input.dayRows ?? []).filter((r) => {
    const tid = String(r?.trainer_id ?? '').trim()
    return tid && tid !== SALES_TRAINING_CLUB_ID
  })

  const workoutsByTrainer =
    input.workoutsByTrainer instanceof Map
      ? input.workoutsByTrainer
      : sumWorkoutsByTrainerFromMatrixRows(dayRows, membershipTypes)

  /** @type {Map<string, Array<{ membership_type_id?: string | null, count?: number }>>} */
  const rowsByTrainer = new Map()
  for (const row of dayRows) {
    const trainerId = String(row.trainer_id ?? '').trim()
    if (!trainerId) continue
    if (!rowsByTrainer.has(trainerId)) rowsByTrainer.set(trainerId, [])
    rowsByTrainer.get(trainerId).push(row)
  }

  /** @type {Map<string, TrainerDayPayrollForecast>} */
  const byTrainer = new Map()
  let clubBaseRub = 0
  let clubTotalRub = 0

  for (const [trainerId, rows] of rowsByTrainer) {
    const profile = getTrainerPayProfile(input.profilesByTrainerId, trainerId, clubId)
    const workoutsMtd = workoutsByTrainer.get(trainerId) ?? 0
    const level = resolveTrainerPayLevel({
      workouts: workoutsMtd,
      onPlan: profile.on_plan,
      planConfig,
    })
    const adj = profile.rate_adjustment_rub
    const atLevel = sumDayPayAtLevel(rows, typeById, level, adj)
    const scenarios = profile.on_plan
      ? null
      : {
          l1: sumDayPayAtLevel(rows, typeById, 1, 0).baseRub,
          l2: sumDayPayAtLevel(rows, typeById, 2, 0).baseRub,
          l3: sumDayPayAtLevel(rows, typeById, 3, 0).baseRub,
        }

    const entry = {
      trainerId,
      onPlan: profile.on_plan,
      level,
      workoutsMtd,
      baseRub: atLevel.baseRub,
      totalRub: atLevel.totalRub,
      adjRubPerSession: adj,
      payableCount: atLevel.payableCount,
      scenarios,
    }
    byTrainer.set(trainerId, entry)
    clubBaseRub = roundRub(clubBaseRub + entry.baseRub)
    clubTotalRub = roundRub(clubTotalRub + entry.totalRub)
  }

  return { clubBaseRub, clubTotalRub, byTrainer }
}

/**
 * Из inputMap дневной формы + опциональный MTD по месяцу.
 * @param {{
 *   inputMap: Record<string, string>,
 *   membershipTypes: Array<object>,
 *   trainerIds?: string[],
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
 *   monthRows?: Array<Record<string, unknown>>,
 *   reportDate?: string,
 * }} input
 */
export function computeDayPayrollForecastFromInputMap(input = {}) {
  const membershipTypes = Array.isArray(input.membershipTypes) ? input.membershipTypes : []
  const trainerIds = input.trainerIds ?? []
  const resolved = resolveTrainingsMatrixForPersist(input.inputMap, trainerIds, membershipTypes)
  if (!resolved.ok) {
    return { clubBaseRub: 0, clubTotalRub: 0, byTrainer: new Map(), ok: false, error: resolved.error }
  }

  const dayRows = resolved.rows.filter((r) => String(r.trainer_id) !== SALES_TRAINING_CLUB_ID)
  const hasTrainerDetail = dayRows.length > 0

  if (!hasTrainerDetail) {
    // Только «По клубу» без разбивки — сухой L1 без кабинета (нет trainer_id).
    const clubRows = resolved.rows
    const typeById = indexTypesById(membershipTypes)
    const at = sumDayPayAtLevel(clubRows, typeById, 1, 0)
    return {
      ok: true,
      clubOnly: true,
      clubBaseRub: at.baseRub,
      clubTotalRub: at.baseRub,
      byTrainer: new Map(),
    }
  }

  const reportDate = String(input.reportDate ?? '').slice(0, 10)
  const workoutsByTrainer =
    Array.isArray(input.monthRows) && reportDate
      ? mergeMtdWorkoutsForReportDay(input.monthRows, reportDate, dayRows, membershipTypes)
      : sumWorkoutsByTrainerFromMatrixRows(dayRows, membershipTypes)

  const forecast = computeTrainerDayPayrollForecast({
    dayRows,
    membershipTypes,
    planConfig: input.planConfig,
    profilesByTrainerId: input.profilesByTrainerId,
    workoutsByTrainer,
    clubId: input.clubId,
  })

  return { ok: true, clubOnly: false, ...forecast }
}

/** Сколько тренировок «в план» у тренера в строках stats. */
export function sumPlanWorkoutsFromTrainerByType(tr, membershipTypes) {
  const typeById = indexTypesById(membershipTypes)
  let n = 0
  for (const row of tr?.byType ?? []) {
    const typeId = row?.typeId == null || row.typeId === '' ? null : String(row.typeId).trim()
    if (!typeId) continue
    const typeRow = typeById.get(typeId)
    if (!typeRow || !membershipTypeCountsTowardPayPlan(typeRow)) continue
    n += Math.trunc(Number(row.count) || 0)
  }
  return n
}

/**
 * Строки матрицы из byTrainerByType статистики Fit-City.
 * @param {Array<{ trainerId: string, byType?: Array<{ typeId: string | null, count: number }> }>} byTrainerByType
 */
export function membershipStatsToMatrixRows(byTrainerByType) {
  const rows = []
  for (const tr of byTrainerByType ?? []) {
    const trainerId = String(tr?.trainerId ?? '').trim()
    if (!trainerId) continue
    for (const t of tr.byType ?? []) {
      if (t.typeId == null || t.typeId === '') continue
      const count = Math.trunc(Number(t.count) || 0)
      if (count <= 0) continue
      rows.push({ trainer_id: trainerId, membership_type_id: String(t.typeId), count })
    }
  }
  return rows
}
