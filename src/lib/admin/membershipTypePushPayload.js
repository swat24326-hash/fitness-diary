/** Нормализация payload membership_types для push в Supabase (без React/IDB). */

import { parseAerobicPayRate } from './aerobicPayrollCore.js'
import { parseTrainerPayRate } from './trainerPayrollCore.js'
import { MEMBERSHIP_TYPE_CODE_MAX_LEN } from '../membershipTypesCore.js'
import {
  normalizeTrainerPayTiersInput,
  resolveTrainerPayTiers,
  trainerPayTiersToRowFields,
} from './trainerPayTiersCore.js'

export const MEMBERSHIP_TYPE_DB_FIELDS = [
  'id',
  'club_id',
  'code',
  'sort_order',
  'is_active',
  'trainer_assignable',
  'trainer_pay_per_session',
  'trainer_pay_l1',
  'trainer_pay_l2',
  'trainer_pay_l3',
  'aerobic_pay_amount',
  'is_pnk_trial',
  'counts_toward_pay_plan',
  'created_at',
]

export function pickMembershipTypeDbFields(obj) {
  const allowed = new Set(MEMBERSHIP_TYPE_DB_FIELDS)
  const out = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj ?? {}, key) && obj[key] !== undefined) {
      out[key] = obj[key]
    }
  }
  return out
}

function payFieldPresent(v) {
  return v != null && v !== ''
}

export function normalizeMembershipTypePushPayload(payload, { insert = false } = {}) {
  const resolved = resolveTrainerPayTiers(payload)
  const hasExplicitTiers =
    payFieldPresent(payload?.trainer_pay_l1) ||
    payFieldPresent(payload?.trainer_pay_l2) ||
    payFieldPresent(payload?.trainer_pay_l3)

  // Только legacy session (старые клиенты) — все три уровня = session.
  const onlyLegacy =
    !hasExplicitTiers && payFieldPresent(payload?.trainer_pay_per_session)
  const payLegacy = onlyLegacy ? parseTrainerPayRate(payload.trainer_pay_per_session) : null
  if (onlyLegacy && Number.isNaN(payLegacy)) {
    return { ok: false, error: 'Оплата за тренировку: неотрицательное число' }
  }

  let tiers
  if (onlyLegacy) {
    tiers = { l1: payLegacy, l2: payLegacy, l3: payLegacy }
  } else {
    const tiersIn = normalizeTrainerPayTiersInput({
      l1: payFieldPresent(payload?.trainer_pay_l1) ? payload.trainer_pay_l1 : resolved.l1,
      l2: payFieldPresent(payload?.trainer_pay_l2) ? payload.trainer_pay_l2 : resolved.l2,
      l3: payFieldPresent(payload?.trainer_pay_l3) ? payload.trainer_pay_l3 : resolved.l3,
    })
    if (!tiersIn.ok) return tiersIn
    tiers = { l1: tiersIn.l1, l2: tiersIn.l2, l3: tiersIn.l3 }
  }

  const aerobicRaw = payload?.aerobic_pay_amount
  const aerobicPay = aerobicRaw == null || aerobicRaw === '' ? 0 : parseAerobicPayRate(aerobicRaw)
  if (Number.isNaN(aerobicPay)) {
    return { ok: false, error: 'Стоимость АЗ: неотрицательное число' }
  }
  const trainerAssignable = payload?.trainer_assignable !== false
  const hasPlanFlag = Object.prototype.hasOwnProperty.call(payload ?? {}, 'counts_toward_pay_plan')
  const countsTowardPayPlan = hasPlanFlag
    ? !(
        payload.counts_toward_pay_plan === false ||
        payload.counts_toward_pay_plan === 0 ||
        payload.counts_toward_pay_plan === '0' ||
        (typeof payload.counts_toward_pay_plan === 'string' &&
          payload.counts_toward_pay_plan.trim().toLowerCase() === 'false')
      )
    : undefined
  const next = pickMembershipTypeDbFields({
    ...payload,
    code: String(payload?.code ?? '').trim().slice(0, MEMBERSHIP_TYPE_CODE_MAX_LEN),
    club_id: String(payload?.club_id ?? '').trim(),
    is_active: payload?.is_active !== false,
    trainer_assignable: trainerAssignable,
    ...trainerPayTiersToRowFields(tiers),
    aerobic_pay_amount: aerobicPay,
    is_pnk_trial: payload?.is_pnk_trial === true,
    ...(hasPlanFlag ? { counts_toward_pay_plan: countsTowardPayPlan } : {}),
  })
  if (insert && !hasPlanFlag) {
    next.counts_toward_pay_plan = false
  }
  if (insert && (!next.code || !next.club_id)) {
    return { ok: false, error: 'Укажите клуб и название типа' }
  }
  return { ok: true, data: next }
}
