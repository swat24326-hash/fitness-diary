/** ЗП персонального зала: матрица отчёта × ставка типа абонемента (без «Без типа»). */

import { parseSalesMoney } from './salesReportCore.js'
import { normalizeMatrixRowsFromDb } from './salesTrainingsMatrix.js'
import { normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'
import {
  effectiveSessionRate,
  getTrainerPayProfile,
  pickMembershipTypeTierRate,
  resolveTrainerPayLevel,
} from './trainerPayProfileCore.js'
import { membershipTypeCountsTowardPayPlan } from './trainerPayTiersCore.js'

export function parseTrainerPayRate(raw) {
  if (raw == null || raw === '') return 0
  const n = parseSalesMoney(raw)
  return Number.isNaN(n) ? NaN : n
}

/** @param {Array<{ id: string, trainer_pay_per_session?: number | string }>} membershipTypes */
export function buildTrainerPayRateMap(membershipTypes) {
  const map = new Map()
  for (const t of membershipTypes ?? []) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    const rate = parseTrainerPayRate(t.trainer_pay_per_session)
    map.set(id, Number.isNaN(rate) ? 0 : rate)
  }
  return map
}

function roundRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function payForCell(count, typeId, rateMap) {
  const tid = typeId == null || typeId === '' ? null : String(typeId).trim()
  if (!tid) return 0
  const countN = Math.trunc(Number(count) || 0)
  if (countN <= 0) return 0
  return roundRub(countN * (rateMap.get(tid) ?? 0))
}

function mergeByTypeLines(target, lines) {
  for (const line of lines ?? []) {
    const hit = target.find((x) => x.typeId === line.typeId)
    if (hit) {
      hit.count += line.count
      hit.amount = roundRub(hit.amount + line.amount)
    } else {
      target.push({ ...line })
    }
  }
}

/**
 * Число тренировок месяца для порогов плана ЗП (ур. 1–3).
 * Без типов — все строки (legacy). С типами — только карты с оплатой > 0 ₽;
 * «Без типа» и типы со ставками 0 не двигают план.
 *
 * @param {Array<{ trainer_id: string, membership_type_id?: string | null, count?: number }>} matrixRows
 * @param {Array<object>|null|undefined} [membershipTypes]
 * @returns {Map<string, number>}
 */
export function sumWorkoutsByTrainerFromMatrixRows(matrixRows, membershipTypes) {
  const typeById =
    Array.isArray(membershipTypes) && membershipTypes.length > 0 ? indexTypesById(membershipTypes) : null
  const map = new Map()
  for (const row of matrixRows ?? []) {
    const trainerId = String(row?.trainer_id ?? '').trim()
    if (!trainerId) continue
    const countN = Math.trunc(Number(row.count) || 0)
    if (countN <= 0) continue
    if (typeById) {
      const typeId =
        row.membership_type_id == null || row.membership_type_id === ''
          ? null
          : String(row.membership_type_id).trim()
      if (!typeId) continue
      const typeRow = typeById.get(typeId)
      if (!typeRow || !membershipTypeCountsTowardPayPlan(typeRow)) continue
    }
    map.set(trainerId, (map.get(trainerId) ?? 0) + countN)
  }
  return map
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
 * @param {string} trainerId
 * @param {string|null} typeId
 * @param {{
 *   typeById: Map<string, object>,
 *   workoutsByTrainer: Map<string, number>,
 *   planConfig: object,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
 * }} ctx
 */
function sessionRateForTrainerType(trainerId, typeId, ctx) {
  const tid = typeId == null || typeId === '' ? null : String(typeId).trim()
  if (!tid) return 0
  const typeRow = ctx.typeById.get(tid)
  if (!typeRow) return 0
  const profile = getTrainerPayProfile(ctx.profilesByTrainerId, trainerId, ctx.clubId ?? '')
  const workouts = ctx.workoutsByTrainer.get(trainerId) ?? 0
  const level = resolveTrainerPayLevel({
    workouts,
    onPlan: profile.on_plan,
    planConfig: ctx.planConfig,
  })
  const base = pickMembershipTypeTierRate(typeRow, level)
  return effectiveSessionRate(base, profile.rate_adjustment_rub)
}

/**
 * @param {Array<{ trainer_id: string, membership_type_id: string | null, count: number }>} matrixRows
 * @param {Map<string, number>|null|undefined} rateMap
 * @param {{
 *   trainerIdFilter?: string | null,
 *   membershipTypes?: Array<object>,
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   workoutsByTrainer?: Map<string, number>|null,
 *   clubId?: string,
 * }} [opts]
 */
export function computePayrollFromMatrixRows(matrixRows, rateMap, opts = {}) {
  const filter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : null
  const useTiers = Array.isArray(opts.membershipTypes) && opts.membershipTypes.length > 0
  const byTrainer = new Map()
  let clubTotal = 0

  let tierCtx = null
  if (useTiers) {
    const workoutsByTrainer =
      opts.workoutsByTrainer instanceof Map
        ? opts.workoutsByTrainer
        : sumWorkoutsByTrainerFromMatrixRows(matrixRows, opts.membershipTypes)
    tierCtx = {
      typeById: indexTypesById(opts.membershipTypes),
      workoutsByTrainer,
      planConfig: normalizeTrainerPayPlanConfig(opts.planConfig),
      profilesByTrainerId: opts.profilesByTrainerId,
      clubId: String(opts.clubId ?? '').trim(),
    }
  }

  const legacyMap = rateMap instanceof Map ? rateMap : new Map()

  for (const row of matrixRows ?? []) {
    const trainerId = String(row?.trainer_id ?? '').trim()
    if (!trainerId) continue
    if (filter && trainerId !== filter) continue
    const typeId =
      row.membership_type_id == null || row.membership_type_id === ''
        ? null
        : String(row.membership_type_id).trim()
    const countN = Math.trunc(Number(row.count) || 0)
    if (countN <= 0) continue

    let amount = 0
    if (tierCtx) {
      if (!typeId) continue
      if (!tierCtx.typeById.has(typeId)) continue
      const rate = sessionRateForTrainerType(trainerId, typeId, tierCtx)
      amount = roundRub(countN * rate)
    } else {
      amount = payForCell(countN, typeId, legacyMap)
      if (amount <= 0) continue
    }

    clubTotal += amount
    if (!byTrainer.has(trainerId)) {
      byTrainer.set(trainerId, { trainerId, total: 0, byType: [] })
    }
    const entry = byTrainer.get(trainerId)
    entry.total = roundRub(entry.total + amount)
    if (!typeId) continue
    mergeByTypeLines(entry.byType, [
      {
        typeId,
        count: countN,
        amount,
      },
    ])
  }

  return { clubTotal: roundRub(clubTotal), byTrainer }
}

/** @param {Record<string, unknown> | null | undefined} dailyRow */
export function computePayrollFromDailyRow(dailyRow, rateMap, opts = {}) {
  const rows = normalizeMatrixRowsFromDb(dailyRow?.trainings_matrix)
  return computePayrollFromMatrixRows(rows, rateMap, opts)
}

/**
 * @param {Array<Record<string, unknown>>} dailyRows
 * @param {Map<string, number>|null|undefined} rateMap
 * @param {Parameters<typeof computePayrollFromMatrixRows>[2]} [opts]
 */
export function aggregatePayrollFromDailyRows(dailyRows, rateMap, opts = {}) {
  const useTiers = Array.isArray(opts.membershipTypes) && opts.membershipTypes.length > 0
  if (useTiers) {
    const allRows = []
    for (const day of dailyRows ?? []) {
      allRows.push(...normalizeMatrixRowsFromDb(day?.trainings_matrix))
    }
    const workoutsByTrainer = sumWorkoutsByTrainerFromMatrixRows(allRows, opts.membershipTypes)
    return computePayrollFromMatrixRows(allRows, rateMap, { ...opts, workoutsByTrainer })
  }

  const byTrainer = new Map()
  let clubTotal = 0

  for (const day of dailyRows ?? []) {
    const dayPay = computePayrollFromDailyRow(day, rateMap, opts)
    clubTotal = roundRub(clubTotal + dayPay.clubTotal)
    for (const [tid, entry] of dayPay.byTrainer) {
      if (!byTrainer.has(tid)) {
        byTrainer.set(tid, { trainerId: tid, total: 0, byType: [] })
      }
      const acc = byTrainer.get(tid)
      acc.total = roundRub(acc.total + entry.total)
      mergeByTypeLines(acc.byType, entry.byType)
    }
  }

  return { clubTotal: roundRub(clubTotal), byTrainer }
}

export function computeNetProfitWithPayroll(earnings, trainerPayroll, expense, aerobicPayroll = 0) {
  const e = Number(earnings) || 0
  const p = Number(trainerPayroll) || 0
  const a = Number(aerobicPayroll) || 0
  const x = Number(expense) || 0
  return roundRub(e - p - a - x)
}

/** Выручка направления − ЗП зала (ПЗ или АЗ). */
export function computeHallNetProfit(revenue, payroll) {
  return roundRub((Number(revenue) || 0) - (Number(payroll) || 0))
}

/** @param {{ byTrainerByType?: Array<{ trainerId: string, byType?: Array<{ typeId: string | null, count: number }> }> }} stats */
export function computePayrollFromMembershipStats(stats, rateMap, opts = {}) {
  const filter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : null
  const rows = []
  for (const tr of stats?.byTrainerByType ?? []) {
    const trainerId = String(tr.trainerId ?? '').trim()
    if (!trainerId) continue
    if (filter && trainerId !== filter) continue
    for (const t of tr.byType ?? []) {
      if (t.typeId == null) continue
      const count = Math.trunc(Number(t.count) || 0)
      if (count <= 0) continue
      rows.push({ trainer_id: trainerId, membership_type_id: t.typeId, count })
    }
  }
  return computePayrollFromMatrixRows(rows, rateMap, opts)
}

/** @param {string} trainerId @param {Map<string, { trainerId: string, total: number }>} byTrainer */
export function trainerPayrollTotalFor(byTrainer, trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return 0
  return roundRub(byTrainer.get(tid)?.total ?? 0)
}
