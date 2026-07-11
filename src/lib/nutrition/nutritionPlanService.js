import { getHealthCurrentWeightKg, getHealthInitialWeightKg } from '../clientWeightCore.js'
import { getHealthSex } from '../healthCardCore.js'
import { saveLocalWithSync } from '../syncService.js'
import { buildNutritionPlan, normalizeNutritionSurvey } from './nutritionPlanBuilder.js'
import { buildNutritionCatalogMap } from './nutritionCatalogResolve.js'
import { appendNutritionPlanHistory, parseNutritionPlanHistory } from './nutritionPlanHistoryCore.js'
import { listNutritionProductsForClub } from './nutritionProductsService.js'

/**
 * @param {unknown} raw
 */
export function parseNutritionJsonField(raw) {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return null
}

export async function loadClientNutritionState(clientId) {
  const { getHealthCard } = await import('../dataAccess.js')
  const health = await getHealthCard(clientId)
  const survey = normalizeNutritionSurvey(parseNutritionJsonField(health?.nutrition_survey))
  const plan = parseNutritionJsonField(health?.nutrition_plan)
  return {
    health,
    survey,
    plan,
    planHistory: parseNutritionPlanHistory(health?.nutrition_plan_history),
    generatedAt: health?.nutrition_plan_generated_at ?? null,
  }
}

/**
 * @param {string} clientId
 * @param {object | null} health
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 * @param {object | null} plan
 */
export async function saveClientNutrition(clientId, health, survey, plan, opts = {}) {
  const currentKg = getHealthCurrentWeightKg(health)
  const generatedAt = plan ? new Date().toISOString() : (health?.nutrition_plan_generated_at ?? null)
  let planHistory = parseNutritionPlanHistory(health?.nutrition_plan_history)

  if (opts.archivePreviousPlan && health?.nutrition_plan && health?.nutrition_plan_generated_at) {
    planHistory = appendNutritionPlanHistory(planHistory, {
      plan: parseNutritionJsonField(health.nutrition_plan),
      generatedAt: String(health.nutrition_plan_generated_at),
    })
  }

  const row = {
    id: health?.id ?? crypto.randomUUID(),
    client_id: clientId,
    height_cm: health?.height_cm ?? null,
    sex: getHealthSex(health),
    health_filled_at: health?.health_filled_at ?? null,
    initial_weight_kg: getHealthInitialWeightKg(health),
    current_weight_kg: currentKg,
    weight_kg: currentKg,
    weight_updated_at: health?.weight_updated_at ?? null,
    goal: health?.goal ?? null,
    diseases: health?.diseases ?? null,
    contraindications: health?.contraindications ?? null,
    medications: health?.medications ?? null,
    notes: health?.notes ?? null,
    nutrition_survey: survey,
    nutrition_plan: plan,
    nutrition_plan_generated_at: generatedAt,
    nutrition_plan_history: planHistory,
    updated_at: new Date().toISOString(),
  }
  await saveLocalWithSync('health_cards', row, {
    table_name: 'health_cards',
    operation: health ? 'update' : 'insert',
    remote_id: health ? row.id : null,
  })
  return row
}

/**
 * @param {string} clientId
 * @param {object | null} health
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 * @param {string} [clubId]
 */
export async function buildAndSaveNutritionPlan(clientId, health, survey, clubId) {
  const clubRows = clubId ? await listNutritionProductsForClub(clubId, { activeOnly: true }) : []
  const catalogMap = buildNutritionCatalogMap(clubRows)
  const result = buildNutritionPlan(health, survey, catalogMap)
  if (!result.ok) return result
  await saveClientNutrition(clientId, health, survey, result.plan, { archivePreviousPlan: true })
  return result
}

export function defaultNutritionSurvey() {
  return {
    age: 30,
    activityLevel: 'moderate',
    goalKind: 'maintain',
    mealsPerDay: 4,
    exclusions: [],
    pickedProducts: { protein: [], fat: [], carbs: [] },
  }
}

export function toggleProductId(list, id) {
  const set = new Set(list ?? [])
  if (set.has(id)) set.delete(id)
  else set.add(id)
  return [...set]
}
