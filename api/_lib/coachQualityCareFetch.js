/**
 * Входы оси «ведение» для coachQuality на club-stats (service role).
 */
import {
  HEALTH_CARDS_BODY_MEASUREMENTS_MONTHS,
  HEALTH_CARDS_MAX,
  HEALTH_CARDS_MAX_BODY_MEASUREMENTS,
  TRAINER_PULL_MAX_WEIGHT_ENTRIES,
  TRAINER_PULL_WEIGHT_ENTRIES_MONTHS,
} from './apiLimits.js'
import { IN_CHUNK } from './adminData/constants.js'
import {
  indexMeasurementsByClient,
  indexWeightEntriesByClient,
} from '../../src/lib/admin/coachQualityAgg.js'

const HEALTH_SELECT =
  'client_id, height_cm, current_weight_kg, initial_weight_kg, weight_kg, sex, goal, nutrition_plan, health_filled_at, updated_at'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string[]} clientIds
 */
export async function fetchCoachQualityCareInputs(supabaseAdmin, clientIds) {
  const ids = [...new Set((clientIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  /** @type {Record<string, object|null>} */
  const healthByClientId = {}
  for (const id of ids) healthByClientId[id] = null

  if (!ids.length) {
    return {
      healthByClientId,
      lastMeasureByClientId: {},
      hadMeasureEverByClientId: {},
      weightEntriesByClientId: {},
    }
  }

  const measures = []
  const weights = []
  const measurementsSince = new Date()
  measurementsSince.setMonth(measurementsSince.getMonth() - HEALTH_CARDS_BODY_MEASUREMENTS_MONTHS)
  const measurementsSinceIso = measurementsSince.toISOString().slice(0, 10)
  const weightsSince = new Date()
  weightsSince.setMonth(weightsSince.getMonth() - TRAINER_PULL_WEIGHT_ENTRIES_MONTHS)
  const weightsSinceIso = weightsSince.toISOString().slice(0, 10)

  let healthCount = 0
  let measureTruncated = false
  let weightTruncated = false

  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue

    if (healthCount < HEALTH_CARDS_MAX) {
      const { data, error } = await supabaseAdmin
        .from('health_cards')
        .select(HEALTH_SELECT)
        .in('client_id', chunk)
      if (error) throw error
      for (const row of data ?? []) {
        const cid = String(row?.client_id ?? '')
        if (!cid) continue
        if (healthCount >= HEALTH_CARDS_MAX) break
        healthByClientId[cid] = row
        healthCount++
      }
    }

    if (!measureTruncated) {
      const { data: bm, error: bme } = await supabaseAdmin
        .from('body_measurements')
        .select('client_id, date')
        .in('client_id', chunk)
        .gte('date', measurementsSinceIso)
      if (bme) throw bme
      for (const row of bm ?? []) {
        if (measures.length >= HEALTH_CARDS_MAX_BODY_MEASUREMENTS) {
          measureTruncated = true
          break
        }
        measures.push(row)
      }
    }

    if (!weightTruncated) {
      const { data: we, error: wee } = await supabaseAdmin
        .from('client_weight_entries')
        .select('client_id, date, weight_kg')
        .in('client_id', chunk)
        .gte('date', weightsSinceIso)
      if (wee) throw wee
      for (const row of we ?? []) {
        if (weights.length >= TRAINER_PULL_MAX_WEIGHT_ENTRIES) {
          weightTruncated = true
          break
        }
        weights.push(row)
      }
    }
  }

  const { lastMeasureByClientId, hadMeasureEverByClientId } = indexMeasurementsByClient(measures)
  return {
    healthByClientId,
    lastMeasureByClientId,
    hadMeasureEverByClientId,
    weightEntriesByClientId: indexWeightEntriesByClient(weights),
  }
}

/**
 * Активные клиенты периода (есть completed в диапазоне) — для оси care.
 * @param {object[]} trainings
 * @param {string} dateFrom
 * @param {string} dateTo
 */
export function activeClientIdsFromTrainings(trainings, dateFrom, dateTo) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const ids = new Set()
  for (const t of trainings ?? []) {
    if (t?.status !== 'completed') continue
    const d = String(t.date ?? '').slice(0, 10)
    if (!d || d < from || d > to) continue
    const cid = String(t.client_id ?? '').trim()
    if (cid) ids.add(cid)
  }
  return [...ids]
}
