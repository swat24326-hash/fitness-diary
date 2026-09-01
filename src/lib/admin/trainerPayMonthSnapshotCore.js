/**
 * Снимок правил ЗП на календарный месяц (ставки типов + план + кабинеты).
 */

import { calendarMonthRelation } from './clubFinanceForecastCore.js'
import { parseAerobicPayRate } from './aerobicPayrollCore.js'
import { normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'
import {
  indexTrainerPayProfilesByTrainerId,
  normalizeTrainerPayProfile,
} from './trainerPayProfileCore.js'
import { resolveTrainerPayTiers, membershipTypeCountsTowardPayPlan } from './trainerPayTiersCore.js'

/**
 * Урезанная строка типа для снимка / расчёта ЗП.
 * @param {object} row
 */
export function slimMembershipTypeForPaySnapshot(row) {
  const tiers = resolveTrainerPayTiers(row)
  const id = String(row?.id ?? '').trim()
  const slim = {
    id,
    code: String(row?.code ?? '').trim(),
    trainer_pay_per_session: tiers.l1,
    trainer_pay_l1: tiers.l1,
    trainer_pay_l2: tiers.l2,
    trainer_pay_l3: tiers.l3,
    trainer_assignable: row?.trainer_assignable !== false,
    counts_toward_pay_plan: membershipTypeCountsTowardPayPlan(row),
  }
  if (row?.trainer_assignable === false && row?.aerobic_pay_amount != null && row?.aerobic_pay_amount !== '') {
    const aerobicParsed = parseAerobicPayRate(row.aerobic_pay_amount)
    slim.aerobic_pay_amount = Number.isNaN(aerobicParsed) ? 0 : aerobicParsed
  }
  return slim
}

/**
 * @param {{
 *   planConfig?: object | null,
 *   profiles?: Array<object> | null,
 *   membershipTypes?: Array<object> | null,
 * }} input
 */
export function buildPayMonthSnapshotPayload(input = {}) {
  const planConfig = normalizeTrainerPayPlanConfig(input.planConfig)
  const profiles = []
  for (const row of input.profiles ?? []) {
    const p = normalizeTrainerPayProfile(row)
    if (!p.trainer_id) continue
    profiles.push({
      trainer_id: p.trainer_id,
      club_id: p.club_id,
      on_plan: p.on_plan,
      rate_adjustment_rub: p.rate_adjustment_rub,
    })
  }
  const membershipTypes = []
  for (const row of input.membershipTypes ?? []) {
    const slim = slimMembershipTypeForPaySnapshot(row)
    if (!slim.id) continue
    membershipTypes.push(slim)
  }
  return { planConfig, profiles, membershipTypes }
}

/**
 * @param {unknown} raw
 */
export function normalizePayMonthSnapshotPayload(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return buildPayMonthSnapshotPayload({
    planConfig: src.planConfig ?? src.plan_config,
    profiles: src.profiles,
    membershipTypes: src.membershipTypes ?? src.membership_types,
  })
}

/**
 * Нужен ли снимок (прошлый календарный месяц).
 * @param {number} year
 * @param {number} month
 * @param {Date} [today]
 */
export function shouldFreezePayMonth(year, month, today = new Date()) {
  return calendarMonthRelation(year, month, today) === -1
}

/**
 * Снимки до fix не хранили aerobic_pay_amount — подставляем из live для типов АЗ.
 * @param {Array<object>} frozenTypes
 * @param {Array<object>} [liveTypes]
 */
export function enrichPaySnapshotMembershipTypesForAerobic(frozenTypes, liveTypes) {
  if (!Array.isArray(frozenTypes) || !frozenTypes.length) return frozenTypes ?? []
  const liveById = new Map((liveTypes ?? []).map((t) => [String(t?.id ?? '').trim(), t]))
  return frozenTypes.map((ft) => {
    if (ft?.trainer_assignable !== false) return ft
    const id = String(ft?.id ?? '').trim()
    if (!id) return ft
    if (ft.aerobic_pay_amount != null && ft.aerobic_pay_amount !== '') return ft
    const live = liveById.get(id)
    if (!live) return ft
    const pay = parseAerobicPayRate(live.aerobic_pay_amount)
    if (Number.isNaN(pay)) return ft
    return { ...ft, aerobic_pay_amount: pay }
  })
}

/**
 * @param {ReturnType<typeof normalizePayMonthSnapshotPayload>} payload
 * @param {{ trainerIdFilter?: string|null, clubId?: string }} [extra]
 */
export function payrollOptsFromSnapshot(payload, extra = {}) {
  const normalized = normalizePayMonthSnapshotPayload(payload)
  return {
    membershipTypes: normalized.membershipTypes,
    planConfig: normalized.planConfig,
    profilesByTrainerId: indexTrainerPayProfilesByTrainerId(normalized.profiles),
    clubId: String(extra.clubId ?? '').trim(),
    trainerIdFilter: extra.trainerIdFilter ?? null,
  }
}
