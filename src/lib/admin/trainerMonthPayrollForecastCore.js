/**
 * Прогноз ЗП персонального зала к концу месяца для чистой прибыли:
 * прогнозный уровень плана (по тренеру) × прогноз часов × микс типов + надбавка кабинета.
 */
import {
  normalizeMatrixRowsFromDb,
  SALES_TRAINING_CLUB_ID,
  sumTypedMatrixRows,
} from './salesTrainingsMatrix.js'
import { normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'
import {
  effectiveSessionRate,
  getTrainerPayProfile,
  pickMembershipTypeTierRate,
  resolveTrainerPayLevel,
} from './trainerPayProfileCore.js'
import { membershipTypeCountsTowardPayPlan } from './trainerPayTiersCore.js'

function roundRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Локальная копия pace (без импорта clubFinanceForecastCore — цикл). */
function payrollFromHoursPace(factHours, factPayroll, forecastHours, fallbackPayroll) {
  const fh = Number(factHours) || 0
  const fp = roundRub(factPayroll)
  const fch = Math.max(0, Number(forecastHours) || 0)
  const fallback = roundRub(fallbackPayroll)
  if (fh <= 0 || fp <= 0) {
    return { payroll: fallback, method: 'payroll_pace_fallback', ratePerSession: null }
  }
  const rate = fp / fh
  return {
    payroll: roundRub(fch * rate),
    method: 'payroll_from_hours',
    ratePerSession: roundRub(rate),
  }
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
 * Собрать факт по тренерам из дневных матриц месяца (без __club__).
 * @param {Array<Record<string, unknown>>} monthRows
 * @param {Array<object>} membershipTypes
 * @returns {Map<string, { hoursByType: Map<string, number>, planWorkouts: number, payableHours: number }>}
 */
export function collectTrainerMonthTrainingFacts(monthRows, membershipTypes) {
  const typeById = indexTypesById(membershipTypes)
  /** @type {Map<string, { hoursByType: Map<string, number>, planWorkouts: number, payableHours: number }>} */
  const byTrainer = new Map()

  const ensure = (tid) => {
    if (!byTrainer.has(tid)) {
      byTrainer.set(tid, { hoursByType: new Map(), planWorkouts: 0, payableHours: 0 })
    }
    return byTrainer.get(tid)
  }

  for (const day of monthRows ?? []) {
    for (const row of normalizeMatrixRowsFromDb(day?.trainings_matrix)) {
      const trainerId = String(row.trainer_id ?? '').trim()
      if (!trainerId || trainerId === SALES_TRAINING_CLUB_ID) continue
      const typeId =
        row.membership_type_id == null || row.membership_type_id === ''
          ? null
          : String(row.membership_type_id).trim()
      const countN = Math.trunc(Number(row.count) || 0)
      if (!typeId || countN <= 0) continue
      const typeRow = typeById.get(typeId)
      if (!typeRow) continue

      const entry = ensure(trainerId)
      const baseL1 = pickMembershipTypeTierRate(typeRow, 1)
      const baseL3 = pickMembershipTypeTierRate(typeRow, 3)
      const payable = Math.max(baseL1, baseL3) > 0
      if (payable) {
        entry.hoursByType.set(typeId, (entry.hoursByType.get(typeId) ?? 0) + countN)
        entry.payableHours += countN
      }
      if (membershipTypeCountsTowardPayPlan(typeRow)) {
        entry.planWorkouts += countN
      }
    }
  }
  return byTrainer
}

/**
 * Средняя ставка за занятие на прогнозном уровне (микс типов факта + adj).
 * @param {{ hoursByType: Map<string, number>, payableHours: number }} fact
 * @param {Map<string, object>} typeById
 * @param {1|2|3} level
 * @param {number} adjRub
 */
export function averageSessionRateAtLevel(fact, typeById, level, adjRub) {
  const hours = Number(fact?.payableHours) || 0
  if (hours <= 0) return 0
  let sum = 0
  for (const [typeId, count] of fact.hoursByType ?? []) {
    const typeRow = typeById.get(typeId)
    if (!typeRow) continue
    const base = pickMembershipTypeTierRate(typeRow, level)
    if (base <= 0) continue
    sum += count * effectiveSessionRate(base, adjRub)
  }
  return roundRub(sum / hours)
}

/**
 * Прогноз ЗП ПЗ к концу месяца.
 * @param {{
 *   monthRows: Array<Record<string, unknown>>,
 *   membershipTypes: Array<object>,
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
 *   forecastClubHours: number,
 *   factClubHours: number,
 *   factPayroll: number,
 *   fallbackPayroll: number,
 * }} opts
 * @returns {{
 *   payroll: number,
 *   method: string,
 *   ratePerSession: number | null,
 *   byTrainer: Map<string, object>,
 *   scale: number,
 * }}
 */
export function forecastTrainerMonthPayroll(opts = {}) {
  const membershipTypes = Array.isArray(opts.membershipTypes) ? opts.membershipTypes : []
  const factPayroll = roundRub(opts.factPayroll)
  const forecastClubHours = Math.max(0, Number(opts.forecastClubHours) || 0)
  const factClubHours = Math.max(0, Number(opts.factClubHours) || 0)
  const fallbackPayroll = roundRub(opts.fallbackPayroll)

  const paceFallback = () => {
    const paced = payrollFromHoursPace(factClubHours, factPayroll, forecastClubHours, fallbackPayroll)
    return {
      payroll: paced.payroll,
      method: paced.method,
      ratePerSession: paced.ratePerSession,
      byTrainer: new Map(),
      scale: factClubHours > 0 ? forecastClubHours / factClubHours : 1,
    }
  }

  if (!membershipTypes.length || forecastClubHours <= 0) {
    return paceFallback()
  }

  const facts = collectTrainerMonthTrainingFacts(opts.monthRows, membershipTypes)
  if (facts.size === 0) {
    return paceFallback()
  }

  const typeById = indexTypesById(membershipTypes)
  const planConfig = normalizeTrainerPayPlanConfig(opts.planConfig)
  const clubId = String(opts.clubId ?? '').trim()

  let factPayableSum = 0
  for (const f of facts.values()) factPayableSum += f.payableHours
  if (factPayableSum <= 0) {
    return paceFallback()
  }

  // Нормировка к клубному прогнозу часов (KPI «Тренировки ПЗ»).
  const scale = forecastClubHours / factPayableSum

  /** @type {Map<string, object>} */
  const byTrainer = new Map()
  let payroll = 0
  let weightedRateSum = 0
  let weightedHours = 0

  for (const [trainerId, fact] of facts) {
    if (fact.payableHours <= 0) continue
    const profile = getTrainerPayProfile(opts.profilesByTrainerId, trainerId, clubId)
    const forecastHours = roundRub(fact.payableHours * scale)
    const planWorkoutsProjected = Math.round(fact.planWorkouts * scale)
    const levelProjected = resolveTrainerPayLevel({
      workouts: planWorkoutsProjected,
      onPlan: profile.on_plan,
      planConfig,
    })
    const levelFact = resolveTrainerPayLevel({
      workouts: fact.planWorkouts,
      onPlan: profile.on_plan,
      planConfig,
    })
    const rate = averageSessionRateAtLevel(fact, typeById, levelProjected, profile.rate_adjustment_rub)
    const amount = roundRub(forecastHours * rate)
    payroll = roundRub(payroll + amount)
    weightedRateSum += rate * forecastHours
    weightedHours += forecastHours
    byTrainer.set(trainerId, {
      trainerId,
      onPlan: profile.on_plan,
      adjRubPerSession: profile.rate_adjustment_rub,
      factHours: fact.payableHours,
      forecastHours,
      planWorkoutsFact: fact.planWorkouts,
      planWorkoutsProjected,
      levelFact,
      levelProjected,
      ratePerSession: rate,
      payroll: amount,
    })
  }

  if (weightedHours <= 0 || payroll <= 0) {
    return paceFallback()
  }

  return {
    payroll: roundRub(payroll),
    method: 'payroll_from_projected_tiers',
    ratePerSession: roundRub(weightedRateSum / weightedHours),
    byTrainer,
    scale: roundRub(scale * 1000) / 1000,
  }
}

/** Сумма типированных часов ПЗ по месяцу (как в finance fact), без __club__ дубля если есть деталь. */
export function sumPzTypedHoursFromMonthRows(monthRows) {
  let n = 0
  for (const day of monthRows ?? []) {
    n += sumTypedMatrixRows(normalizeMatrixRowsFromDb(day?.trainings_matrix))
  }
  return n
}
