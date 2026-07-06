/** Нормализация payload membership_types для push в Supabase (без React/IDB). */

import { parseAerobicPayRate } from './aerobicPayrollCore.js'
import { parseTrainerPayRate } from './trainerPayrollCore.js'

export const MEMBERSHIP_TYPE_DB_FIELDS = [
  'id',
  'club_id',
  'code',
  'sort_order',
  'is_active',
  'trainer_assignable',
  'trainer_pay_per_session',
  'aerobic_pay_amount',
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

export function normalizeMembershipTypePushPayload(payload, { insert = false } = {}) {
  const payRaw = payload?.trainer_pay_per_session
  const pay = payRaw == null || payRaw === '' ? 0 : parseTrainerPayRate(payRaw)
  if (Number.isNaN(pay)) {
    return { ok: false, error: 'Оплата за тренировку: неотрицательное число' }
  }
  const aerobicRaw = payload?.aerobic_pay_amount
  const aerobicPay = aerobicRaw == null || aerobicRaw === '' ? 0 : parseAerobicPayRate(aerobicRaw)
  if (Number.isNaN(aerobicPay)) {
    return { ok: false, error: 'Стоимость АЗ: неотрицательное число' }
  }
  const trainerAssignable = payload?.trainer_assignable !== false
  const next = pickMembershipTypeDbFields({
    ...payload,
    code: String(payload?.code ?? '').trim().slice(0, 12),
    club_id: String(payload?.club_id ?? '').trim(),
    is_active: payload?.is_active !== false,
    trainer_assignable: trainerAssignable,
    trainer_pay_per_session: pay,
    aerobic_pay_amount: aerobicPay,
  })
  if (insert && (!next.code || !next.club_id)) {
    return { ok: false, error: 'Укажите клуб и название типа' }
  }
  return { ok: true, data: next }
}
