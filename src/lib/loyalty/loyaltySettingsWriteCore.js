/**
 * POST настроек клуба: ставки + тумблер интервалов. Без fetch.
 */

import { applyProgramToggle } from './loyaltyEnabledCore.js'
import { loyaltyRatesFromSettings, normalizeLoyaltySettings } from './loyaltySettingsCore.js'

/**
 * @param {unknown} currentRow
 * @param {object} body
 * @param {string} asOf
 * @returns {{ settings: object, toggled: boolean }}
 */
export function applyLoyaltySettingsPost(currentRow, body = {}, asOf) {
  const prev = normalizeLoyaltySettings(currentRow)
  const merged = {
    ...prev,
    enabled: prev.enabled,
    enabled_at: prev.enabled_at,
    enabled_intervals: prev.enabled_intervals,
    cycle_months: body.cycle_months ?? prev.cycle_months,
    points_per_week: body.points_per_week ?? prev.points_per_week,
    kcal_chunk: body.kcal_chunk ?? prev.kcal_chunk,
    points_per_kcal_chunk: body.points_per_kcal_chunk ?? prev.points_per_kcal_chunk,
    max_minutes: body.max_minutes ?? prev.max_minutes,
    max_kcal_per_training: body.max_kcal_per_training ?? prev.max_kcal_per_training,
  }

  let toggled = false
  if (typeof body.enabled === 'boolean' && body.enabled !== prev.enabled) {
    toggled = true
    merged.enabled = body.enabled
    merged.enabled_intervals = applyProgramToggle(prev.enabled_intervals, {
      enabled: body.enabled,
      as_of: asOf,
    })
    if (body.enabled === true && !prev.enabled_at) merged.enabled_at = asOf
  }

  const settings = normalizeLoyaltySettings(merged)
  return { settings, toggled, rates: loyaltyRatesFromSettings(settings) }
}

/**
 * @param {object} settings
 * @param {string} clubId
 */
export function loyaltySettingsToDbRow(settings, clubId) {
  const s = normalizeLoyaltySettings(settings)
  return {
    club_id: clubId,
    enabled: s.enabled,
    enabled_at: s.enabled_at,
    enabled_intervals: s.enabled_intervals,
    cycle_months: s.cycle_months,
    points_per_week: s.points_per_week,
    kcal_chunk: s.kcal_chunk,
    points_per_kcal_chunk: s.points_per_kcal_chunk,
    max_minutes: s.max_minutes,
    max_kcal_per_training: s.max_kcal_per_training,
    updated_at: new Date().toISOString(),
  }
}
