/**
 * Прогноз ЗП за период по таблице «тренировки по типам карт» (Fit-City / статистика).
 */
import { normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'
import {
  getTrainerPayProfile,
  resolveTrainerPayLevel,
} from './trainerPayProfileCore.js'
import {
  membershipStatsToMatrixRows,
  sumDayPayAtLevel,
  sumPlanWorkoutsFromTrainerByType,
} from './trainerDayPayrollForecastCore.js'

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
 * Линейный прогноз числа тренировок до конца периода.
 * @param {number} workoutsFact
 * @param {number} daysElapsed
 * @param {number} daysInPeriod
 */
export function projectWorkoutsToPeriodEnd(workoutsFact, daysElapsed, daysInPeriod) {
  const fact = Math.max(0, Math.trunc(Number(workoutsFact) || 0))
  const elapsed = Math.max(0, Math.trunc(Number(daysElapsed) || 0))
  const total = Math.max(0, Math.trunc(Number(daysInPeriod) || 0))
  if (total <= 0) return fact
  if (elapsed <= 0) return fact
  if (elapsed >= total) return fact
  return Math.round((fact * total) / elapsed)
}

/**
 * Число календарных дней включительно между ISO-датами.
 * @param {string} dateFrom
 * @param {string} dateTo
 */
export function inclusiveDayCount(dateFrom, dateTo) {
  const a = String(dateFrom ?? '').slice(0, 10)
  const b = String(dateTo ?? '').slice(0, 10)
  if (!a || !b || b < a) return 0
  const pa = a.split('-').map(Number)
  const pb = b.split('-').map(Number)
  const da = new Date(pa[0], pa[1] - 1, pa[2])
  const db = new Date(pb[0], pb[1] - 1, pb[2])
  return Math.round((db - da) / 86400000) + 1
}

/**
 * Дней периода, уже прошедших на asOf (включительно), clamp к [0, daysInPeriod].
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {string} [asOfIso]
 */
export function elapsedDaysInPeriod(dateFrom, dateTo, asOfIso) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const asOf = String(asOfIso ?? to).slice(0, 10)
  const total = inclusiveDayCount(from, to)
  if (!total) return 0
  if (!asOf || asOf < from) return 0
  const end = asOf > to ? to : asOf
  return inclusiveDayCount(from, end)
}

/**
 * @typedef {{
 *   trainerId: string,
 *   onPlan: boolean,
 *   levelFact: 1|2|3,
 *   levelProjected: 1|2|3,
 *   workoutsFact: number,
 *   workoutsProjected: number,
 *   baseRub: number,
 *   totalRub: number,
 *   adjRubPerSession: number,
 *   scenarios: { l1: number, l2: number, l3: number } | null,
 *   gapToL2: number | null,
 *   gapToL3: number | null,
 *   planHint: string,
 * }} TrainerPeriodPayrollForecast
 */

/**
 * @param {{
 *   byTrainerByType: Array<{ trainerId: string, byType?: object[] }>,
 *   membershipTypes: Array<object>,
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
 *   dateFrom?: string,
 *   dateTo?: string,
 *   asOfIso?: string,
 * }} input
 */
export function computePeriodPayrollForecastFromTypeStats(input = {}) {
  const membershipTypes = Array.isArray(input.membershipTypes) ? input.membershipTypes : []
  const typeById = indexTypesById(membershipTypes)
  const planConfig = normalizeTrainerPayPlanConfig(input.planConfig)
  const clubId = String(input.clubId ?? '').trim()
  const daysInPeriod = inclusiveDayCount(input.dateFrom, input.dateTo)
  const daysElapsed = elapsedDaysInPeriod(input.dateFrom, input.dateTo, input.asOfIso)

  /** @type {Map<string, TrainerPeriodPayrollForecast>} */
  const byTrainer = new Map()
  let clubBaseRub = 0
  let clubTotalRub = 0

  for (const tr of input.byTrainerByType ?? []) {
    const trainerId = String(tr?.trainerId ?? '').trim()
    if (!trainerId) continue
    const profile = getTrainerPayProfile(input.profilesByTrainerId, trainerId, clubId)
    const workoutsFact = sumPlanWorkoutsFromTrainerByType(tr, membershipTypes)
    const workoutsProjected = profile.on_plan
      ? projectWorkoutsToPeriodEnd(workoutsFact, daysElapsed, daysInPeriod)
      : workoutsFact
    const levelFact = resolveTrainerPayLevel({
      workouts: workoutsFact,
      onPlan: profile.on_plan,
      planConfig,
    })
    const levelProjected = resolveTrainerPayLevel({
      workouts: workoutsProjected,
      onPlan: profile.on_plan,
      planConfig,
    })

    const matrixRows = membershipStatsToMatrixRows([tr])
    const adj = profile.rate_adjustment_rub
    const at = sumDayPayAtLevel(matrixRows, typeById, levelFact, adj)
    const scenarios = profile.on_plan
      ? null
      : {
          l1: sumDayPayAtLevel(matrixRows, typeById, 1, 0).baseRub,
          l2: sumDayPayAtLevel(matrixRows, typeById, 2, 0).baseRub,
          l3: sumDayPayAtLevel(matrixRows, typeById, 3, 0).baseRub,
        }

    let gapToL2 = null
    let gapToL3 = null
    let planHint = ''
    if (profile.on_plan) {
      gapToL2 = Math.max(0, planConfig.workouts_l2_min - workoutsFact)
      gapToL3 = Math.max(0, planConfig.workouts_l3_min - workoutsFact)
      if (levelProjected >= 3) {
        planHint = 'прогноз: ур. 3'
      } else if (levelProjected >= 2) {
        planHint =
          gapToL3 > 0
            ? `прогноз: ур. 2 · до ур. 3 ещё ~${Math.max(0, planConfig.workouts_l3_min - workoutsProjected)}`
            : 'прогноз: ур. 2'
      } else {
        planHint =
          gapToL2 > 0 ? `прогноз: ур. 1 · до ур. 2 ещё ${gapToL2}` : 'прогноз: ур. 1'
      }
    } else {
      planHint = 'без плана · ур. 3'
    }

    const entry = {
      trainerId,
      onPlan: profile.on_plan,
      levelFact,
      levelProjected,
      workoutsFact,
      workoutsProjected,
      baseRub: at.baseRub,
      totalRub: at.totalRub,
      adjRubPerSession: adj,
      scenarios,
      gapToL2,
      gapToL3,
      planHint,
    }
    byTrainer.set(trainerId, entry)
    clubBaseRub = roundRub(clubBaseRub + entry.baseRub)
    clubTotalRub = roundRub(clubTotalRub + entry.totalRub)
  }

  return {
    clubBaseRub,
    clubTotalRub,
    byTrainer,
    daysInPeriod,
    daysElapsed,
  }
}
