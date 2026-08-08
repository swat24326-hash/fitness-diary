/**
 * Кабинет тренера: план / без плана + ±₽ к ставке за тренировку.
 */

import { resolveTrainerPayTierByWorkouts, normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'
import { resolveTrainerPayTiers } from './trainerPayTiersCore.js'

/** @typedef {{ trainer_id: string, club_id: string, on_plan: boolean, rate_adjustment_rub: number }} TrainerPayProfile */

/**
 * true по умолчанию; явно false / «false» / 0 → без плана.
 * @param {unknown} raw
 */
export function coerceOnPlan(raw) {
  if (raw === false || raw === 0 || raw === '0') return false
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'false') return false
  return true
}

export function defaultTrainerPayProfile(trainerId = '', clubId = '') {
  return {
    trainer_id: String(trainerId ?? '').trim(),
    club_id: String(clubId ?? '').trim(),
    on_plan: true,
    rate_adjustment_rub: 0,
  }
}

/**
 * ±₽ к ставке: допускает отрицательные (в отличие от parseSalesMoney для цен).
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseRateAdjustmentRub(raw) {
  if (raw == null || raw === '') return 0
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    return Math.round(raw * 100) / 100
  }
  const s = String(raw)
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[−–—]/g, '-')
  if (!s || s === '-' || s === '+') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

/**
 * @param {unknown} raw
 * @param {{ trainer_id?: string, club_id?: string }} [ids]
 * @returns {TrainerPayProfile}
 */
export function normalizeTrainerPayProfile(raw, ids = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const adj = parseRateAdjustmentRub(src.rate_adjustment_rub)
  return {
    trainer_id: String(src.trainer_id ?? ids.trainer_id ?? '').trim(),
    club_id: String(src.club_id ?? ids.club_id ?? '').trim(),
    on_plan: coerceOnPlan(src.on_plan),
    rate_adjustment_rub: adj == null ? 0 : adj,
  }
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, profile: TrainerPayProfile } | { ok: false, error: string }}
 */
export function validateTrainerPayProfileForSave(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const trainerId = String(src.trainer_id ?? '').trim()
  const clubId = String(src.club_id ?? '').trim()
  if (!trainerId) return { ok: false, error: 'Укажите тренера' }
  if (!clubId) return { ok: false, error: 'Укажите клуб' }
  const adj = parseRateAdjustmentRub(src.rate_adjustment_rub)
  if (adj == null) {
    return { ok: false, error: 'Надбавка/минус: число в рублях (можно отрицательное)' }
  }
  if (Math.abs(adj) > 99999) {
    return { ok: false, error: 'Слишком большая надбавка (макс. ±99999 ₽)' }
  }
  return {
    ok: true,
    profile: {
      trainer_id: trainerId,
      club_id: clubId,
      on_plan: coerceOnPlan(src.on_plan),
      rate_adjustment_rub: adj,
    },
  }
}

/**
 * Уровень ставки 1|2|3: без плана всегда 3; с планом — по порогам клуба.
 * @param {{
 *   workouts?: unknown,
 *   onPlan?: boolean,
 *   planConfig?: import('./trainerPayPlanCore.js').TrainerPayPlanConfig | null,
 * }} input
 * @returns {1|2|3}
 */
export function resolveTrainerPayLevel(input = {}) {
  if (input.onPlan === false) return 3
  return resolveTrainerPayTierByWorkouts(input.workouts, normalizeTrainerPayPlanConfig(input.planConfig))
}

/**
 * @param {unknown} typeRow
 * @param {1|2|3} level
 * @returns {number}
 */
export function pickMembershipTypeTierRate(typeRow, level) {
  const tiers = resolveTrainerPayTiers(typeRow)
  if (level === 3) return tiers.l3
  if (level === 2) return tiers.l2
  return tiers.l1
}

/**
 * Ставка за тренировку с надбавкой кабинета.
 * Карта с оплатой 0 ₽ (база уровня) — ±₽ не применяем: нельзя «накрутить» или увести в минус нулевую ставку.
 * @param {number} baseRate
 * @param {number} adjustment
 * @returns {number}
 */
export function effectiveSessionRate(baseRate, adjustment) {
  const base = Number(baseRate) || 0
  if (base <= 0) return 0
  const adj = Number(adjustment) || 0
  const n = Math.round((base + adj) * 100) / 100
  return n < 0 ? 0 : n
}

/**
 * @param {Iterable<TrainerPayProfile|object>|null|undefined} rows
 * @returns {Map<string, TrainerPayProfile>}
 */
export function indexTrainerPayProfilesByTrainerId(rows) {
  const map = new Map()
  for (const row of rows ?? []) {
    const p = normalizeTrainerPayProfile(row)
    if (!p.trainer_id) continue
    map.set(p.trainer_id, p)
  }
  return map
}

/**
 * @param {Map<string, TrainerPayProfile>|Record<string, TrainerPayProfile>|null|undefined} profiles
 * @param {string} trainerId
 * @param {string} [clubId]
 */
export function getTrainerPayProfile(profiles, trainerId, clubId = '') {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return defaultTrainerPayProfile('', clubId)
  if (profiles instanceof Map) {
    return normalizeTrainerPayProfile(profiles.get(tid) ?? defaultTrainerPayProfile(tid, clubId), {
      trainer_id: tid,
      club_id: clubId,
    })
  }
  if (profiles && typeof profiles === 'object') {
    return normalizeTrainerPayProfile(profiles[tid] ?? defaultTrainerPayProfile(tid, clubId), {
      trainer_id: tid,
      club_id: clubId,
    })
  }
  return defaultTrainerPayProfile(tid, clubId)
}
