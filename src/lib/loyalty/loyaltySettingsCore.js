import { normalizeEnabledIntervals } from './loyaltyEnabledCore.js'

/**
 * Настройки лояльности клуба (после normalize).
 * @typedef {object} LoyaltySettings
 * @property {boolean} enabled
 * @property {string | null} enabled_at
 * @property {{ start: string, end: string | null }[]} enabled_intervals
 * @property {number} cycle_months
 * @property {number} points_per_week
 * @property {number} kcal_chunk
 * @property {number} points_per_kcal_chunk
 * @property {number} max_minutes
 * @property {number} max_kcal_per_training
 */

/**
 * Ставки цикла (снимок ledger или с settings).
 * @typedef {object} LoyaltyRates
 * @property {number} cycle_months
 * @property {number} points_per_week
 * @property {number} kcal_chunk
 * @property {number} points_per_kcal_chunk
 */

function intInRange(raw, fallback, min, max) {
  const n = Math.trunc(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function intMin(raw, fallback, min) {
  const n = Math.trunc(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, n)
}

/**
 * @param {unknown} raw
 * @returns {LoyaltySettings}
 */
export function normalizeLoyaltySettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const enabled = src.enabled === true
  const enabled_at = String(src.enabled_at ?? '').slice(0, 10)
  const enabledAt = /^\d{4}-\d{2}-\d{2}$/.test(enabled_at) ? enabled_at : null
  let enabled_intervals = normalizeEnabledIntervals(src.enabled_intervals)
  if (enabled && enabled_intervals.length === 0 && enabledAt) {
    enabled_intervals = [{ start: enabledAt, end: null }]
  }

  const cycle_months = intInRange(src.cycle_months, 3, 1, 24)
  const points_per_week = intMin(src.points_per_week, 50, 0)
  const kcal_chunk = intMin(src.kcal_chunk, 100, 1)
  const points_per_kcal_chunk = intMin(src.points_per_kcal_chunk, 5, 0)
  const max_minutes = intInRange(src.max_minutes, 60, 1, 180)
  const max_kcal_per_training = intMin(src.max_kcal_per_training, 800, 0)

  return {
    enabled,
    enabled_at: enabledAt,
    enabled_intervals,
    cycle_months,
    points_per_week,
    kcal_chunk,
    points_per_kcal_chunk,
    max_minutes,
    max_kcal_per_training,
  }
}

/**
 * @param {LoyaltySettings} s
 * @returns {LoyaltyRates}
 */
export function loyaltyRatesFromSettings(s) {
  return {
    cycle_months: s.cycle_months,
    points_per_week: s.points_per_week,
    kcal_chunk: s.kcal_chunk,
    points_per_kcal_chunk: s.points_per_kcal_chunk,
  }
}

/**
 * @param {unknown} raw
 * @param {LoyaltyRates} [fallback]
 * @returns {LoyaltyRates}
 */
export function normalizeLoyaltyRatesSnapshot(raw, fallback) {
  const fb = fallback || {
    cycle_months: 3,
    points_per_week: 50,
    kcal_chunk: 100,
    points_per_kcal_chunk: 5,
  }
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    cycle_months: intInRange(src.cycle_months, fb.cycle_months, 1, 24),
    points_per_week: intMin(src.points_per_week, fb.points_per_week, 0),
    kcal_chunk: intMin(src.kcal_chunk, fb.kcal_chunk, 1),
    points_per_kcal_chunk: intMin(src.points_per_kcal_chunk, fb.points_per_kcal_chunk, 0),
  }
}
