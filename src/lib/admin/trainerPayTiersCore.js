/**
 * Три ставки ЗП тренера на типе карты (уровни 1–3).
 * Пороги часов месяца — отдельно (клуб); здесь только цены на карте.
 */

import { parseTrainerPayRate } from './trainerPayrollCore.js'

/**
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function parseTrainerPayTierAmount(raw, fallback = 0) {
  if (raw == null || raw === '') {
    const fb = Number(fallback)
    return Number.isFinite(fb) && fb >= 0 ? fb : 0
  }
  const n = parseTrainerPayRate(raw)
  if (Number.isNaN(n)) return NaN
  return n
}

/**
 * @param {{
 *   trainer_pay_per_session?: number | string | null,
 *   trainer_pay_l1?: number | string | null,
 *   trainer_pay_l2?: number | string | null,
 *   trainer_pay_l3?: number | string | null,
 * } | null | undefined} row
 * @returns {{ l1: number, l2: number, l3: number }}
 */
export function resolveTrainerPayTiers(row) {
  const legacyRaw = row?.trainer_pay_per_session
  const legacyParsed = legacyRaw == null || legacyRaw === '' ? 0 : parseTrainerPayRate(legacyRaw)
  const legacy = Number.isNaN(legacyParsed) ? 0 : legacyParsed

  const l1Raw = row?.trainer_pay_l1
  const l2Raw = row?.trainer_pay_l2
  const l3Raw = row?.trainer_pay_l3

  const hasL1 = l1Raw != null && l1Raw !== ''
  const hasL2 = l2Raw != null && l2Raw !== ''
  const hasL3 = l3Raw != null && l3Raw !== ''

  const l1 = hasL1 ? parseTrainerPayTierAmount(l1Raw, legacy) : legacy
  const l2 = hasL2 ? parseTrainerPayTierAmount(l2Raw, Number.isNaN(l1) ? legacy : l1) : Number.isNaN(l1) ? legacy : l1
  const l3 = hasL3 ? parseTrainerPayTierAmount(l3Raw, Number.isNaN(l2) ? legacy : l2) : Number.isNaN(l2) ? legacy : l2

  return {
    l1: Number.isNaN(l1) ? 0 : l1,
    l2: Number.isNaN(l2) ? 0 : l2,
    l3: Number.isNaN(l3) ? 0 : l3,
  }
}

/**
 * Нормализация трёх ставок из черновика UI / payload.
 * @param {{ l1?: unknown, l2?: unknown, l3?: unknown }} raw
 * @returns {{ ok: true, l1: number, l2: number, l3: number } | { ok: false, error: string }}
 */
export function normalizeTrainerPayTiersInput(raw = {}) {
  const l1 = parseTrainerPayTierAmount(raw.l1, 0)
  const l2 = parseTrainerPayTierAmount(raw.l2, 0)
  const l3 = parseTrainerPayTierAmount(raw.l3, 0)
  if (Number.isNaN(l1) || Number.isNaN(l2) || Number.isNaN(l3)) {
    return { ok: false, error: 'Ставки уровней: неотрицательные числа (₽)' }
  }
  return { ok: true, l1, l2, l3 }
}

/**
 * Поля для записи в row / push: уровни + legacy session = l1.
 * @param {{ l1: number, l2: number, l3: number }} tiers
 */
export function trainerPayTiersToRowFields(tiers) {
  const l1 = Number(tiers?.l1) || 0
  const l2 = Number(tiers?.l2) || 0
  const l3 = Number(tiers?.l3) || 0
  return {
    trainer_pay_l1: l1,
    trainer_pay_l2: l2,
    trainer_pay_l3: l3,
    trainer_pay_per_session: l1,
  }
}
