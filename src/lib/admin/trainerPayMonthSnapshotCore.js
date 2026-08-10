/**
 * Снимок правил ЗП на календарный месяц (ставки типов + план + кабинеты).
 */

import { calendarMonthRelation } from './clubFinanceForecastCore.js'
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
  return {
    id,
    code: String(row?.code ?? '').trim(),
    trainer_pay_per_session: tiers.l1,
    trainer_pay_l1: tiers.l1,
    trainer_pay_l2: tiers.l2,
    trainer_pay_l3: tiers.l3,
    trainer_assignable: row?.trainer_assignable !== false,
    counts_toward_pay_plan: membershipTypeCountsTowardPayPlan(row),
  }
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
