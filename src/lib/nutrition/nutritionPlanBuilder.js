import { getHealthCurrentWeightKg } from '../clientWeightCore.js'
import { getHealthSex } from '../healthCardCore.js'
import { buildNutritionCatalogMap } from './nutritionCatalogResolve.js'
import { computeBmr, computeTdee } from './nutritionMacrosCore.js'
import { getMealSlots } from './nutritionMealSlotsCore.js'
import { buildMealForSlot } from './nutritionRecipesCore.js'
import {
  computeNutritionReferents,
  macroTargetsFromReferents,
} from './nutritionReferentsCore.js'
import { surveyBuildKey } from './nutritionPlanSessionCore.js'
import {
  resolveSurveyProductPools,
  validateSurveyProductPools,
} from './nutritionSurveyProductsCore.js'
import { normalizeProteinAccent } from './nutritionProteinAccentCore.js'
import { clampDayCount } from './nutritionDaysCountCore.js'
import { mealPrepModesForDay } from './nutritionMealPrepCore.js'
import { topUpDayPlanTowardTargets } from './nutritionMealTopUpCore.js'

/**
 * @typedef {object} NutritionSurvey
 * @property {number} [age]
 * @property {import('./nutritionMacrosCore.js').NutritionActivityLevel} [activityLevel]
 * @property {import('./nutritionMacrosCore.js').NutritionGoalKind} [goalKind]
 * @property {number} [mealsPerDay]
 * @property {string[]} [exclusions] — теги: lactose, gluten
 * @property {string[]} [avoidProductIds] — продукты, которые клиент не ест (режим avoid)
 * @property {'avoid'|'pick'} [productSelectMode]
 * @property {{ protein?: string[], fat?: string[], carbs?: string[] }} [pickedProducts] — устаревший opt-in
 * @property {import('./nutritionProteinAccentCore.js').NutritionProteinAccent} [proteinAccent]
 * @property {number} [daysCount] — 3–7 дней рациона
 * @property {boolean} [nutritionAutoPush] — авто-выдача в /me при пересчёте
 * @property {number} [_mealIndexOffset] — внутренний сдвиг вариантов (неделя)
 * @property {number} [_dayIndex] — индекс дня в неделе (маска база/рецепт)
 */

/**
 * @param {unknown} raw
 * @returns {NutritionSurvey}
 */
export function normalizeNutritionSurvey(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const o = /** @type {Record<string, unknown>} */ (raw)
  const pp = o.pickedProducts
  let pickedProducts = {}
  if (pp && typeof pp === 'object') {
    const p = /** @type {Record<string, unknown>} */ (pp)
    pickedProducts = {
      protein: Array.isArray(p.protein) ? p.protein.map(String) : [],
      fat: Array.isArray(p.fat) ? p.fat.map(String) : [],
      carbs: Array.isArray(p.carbs) ? p.carbs.map(String) : [],
    }
  }
  const meals = Number(o.mealsPerDay)
  const mode = o.productSelectMode === 'pick' || o.productSelectMode === 'avoid' ? o.productSelectMode : undefined
  const daysRaw = Number(o.daysCount)
  let daysCount
  if (Number.isFinite(daysRaw)) {
    daysCount = daysRaw >= 3 ? clampDayCount(daysRaw) : 1
  }
  return {
    age: Number.isFinite(Number(o.age)) ? Number(o.age) : undefined,
    activityLevel: typeof o.activityLevel === 'string' ? o.activityLevel : undefined,
    goalKind: typeof o.goalKind === 'string' ? o.goalKind : undefined,
    mealsPerDay: meals >= 3 && meals <= 6 ? meals : undefined,
    exclusions: Array.isArray(o.exclusions) ? o.exclusions.map(String) : [],
    avoidProductIds: Array.isArray(o.avoidProductIds) ? o.avoidProductIds.map(String) : [],
    productSelectMode: mode,
    pickedProducts,
    proteinAccent: normalizeProteinAccent(o.proteinAccent),
    daysCount,
    nutritionAutoPush: o.nutritionAutoPush === true,
    _mealIndexOffset: Number.isFinite(Number(o._mealIndexOffset)) ? Number(o._mealIndexOffset) : undefined,
    _dayIndex: Number.isFinite(Number(o._dayIndex)) ? Number(o._dayIndex) : undefined,
  }
}

/**
 * @param {{ height_cm?: number | null, weight_kg?: number | null, goal?: string | null }} health
 * @param {NutritionSurvey} survey
 */
export function getNutritionHealthBasics(health, survey) {
  const currentKg = getHealthCurrentWeightKg(health)
  return {
    heightCm: health?.height_cm != null ? Number(health.height_cm) : null,
    weightKg: currentKg,
    goalText: health?.goal ?? null,
    sex: getHealthSex(health),
    age: survey.age,
    activityLevel: survey.activityLevel,
    goalKind: survey.goalKind,
  }
}

export function isNutritionHealthReady(health) {
  const h = Number(health?.height_cm)
  const w = getHealthCurrentWeightKg(health)
  return Number.isFinite(h) && h > 0 && w != null && w > 0 && !!getHealthSex(health)
}

export function validateSurveyForBuild(survey, catalogMap) {
  const errors = []
  if (!survey.age || survey.age < 14 || survey.age > 90) errors.push('Укажите возраст (14–90)')
  if (!survey.activityLevel) errors.push('Укажите активность')
  if (!survey.goalKind) errors.push('Укажите цель')
  if (!survey.mealsPerDay) errors.push('Укажите число приёмов пищи')
  if (catalogMap) errors.push(...validateSurveyProductPools(survey, catalogMap))
  return errors
}

function sumItems(items) {
  return items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + (it.kcal ?? 0),
      proteinG: Math.round((acc.proteinG + (it.proteinG ?? 0)) * 10) / 10,
      fatG: Math.round((acc.fatG + (it.fatG ?? 0)) * 10) / 10,
      carbsG: Math.round((acc.carbsG + (it.carbsG ?? 0)) * 10) / 10,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  )
}

/**
 * @param {{ height_cm?: number | null, weight_kg?: number | null }} health
 * @param {NutritionSurvey} survey
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} [catalogMap]
 */
export function buildNutritionPlan(health, survey, catalogMap) {
  const catalog = catalogMap ?? buildNutritionCatalogMap([])
  const errors = validateSurveyForBuild(survey, catalog)
  if (!isNutritionHealthReady(health)) {
    errors.push('Заполните рост, вес и пол во вкладке «Здоровье»')
  }
  if (errors.length) return { ok: false, errors, plan: null }

  const basics = getNutritionHealthBasics(health, survey)
  const bmr = computeBmr({
    sex: basics.sex,
    age: basics.age,
    weightKg: basics.weightKg,
    heightCm: basics.heightCm,
  })
  const tdee = computeTdee(bmr, /** @type {import('./nutritionMacrosCore.js').NutritionActivityLevel} */ (basics.activityLevel))
  const referents = computeNutritionReferents({
    sex: basics.sex,
    age: basics.age,
    weightKg: basics.weightKg,
    heightCm: basics.heightCm,
    activityLevel: basics.activityLevel,
    goalKind: basics.goalKind,
  })
  const kcalTarget = referents?.kcal.aim ?? tdee
  const macros = macroTargetsFromReferents(referents)

  const productIdsByGroup = resolveSurveyProductPools(survey, catalog)
  const proteinAccent = normalizeProteinAccent(survey.proteinAccent)
  const mealIndexOffset = Number(survey._mealIndexOffset) || 0

  const slots = getMealSlots(survey.mealsPerDay)
  const dayIndex = Number.isFinite(Number(survey._dayIndex)) ? Number(survey._dayIndex) : 0
  const prepModes = mealPrepModesForDay(survey.mealsPerDay, dayIndex)
  /** @type {object[]} */
  let dayPlan = []
  /** @type {string[]} */
  const usedDishIds = []
  for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx]
    const mealKcalBudget = Math.round(kcalTarget * slot.ratio)
    const preferPrep = prepModes[idx] ?? 'base'
    const dish = buildMealForSlot({
      slotId: slot.id,
      mealIndex: idx + mealIndexOffset,
      mealKcalBudget,
      productIdsByGroup,
      catalogMap: catalog,
      proteinAccent,
      avoidDishIds: usedDishIds,
      preferPrep,
    })
    if (!dish?.items?.length) {
      return {
        ok: false,
        errors: [`Не удалось собрать блюдо для «${slot.label}» — расширьте выбор продуктов`],
        plan: null,
      }
    }
    if (dish.dishId) usedDishIds.push(String(dish.dishId))
    dayPlan.push({
      slot: slot.id,
      label: slot.label,
      dishId: dish.dishId,
      dishLabel: dish.dishLabel,
      prep: dish.prep ?? (dish.source === 'recipe' ? 'recipe' : 'base'),
      source: dish.source === 'recipe' ? 'recipe' : 'base',
      recipeId: dish.recipeId,
      recipeSteps: dish.recipeSteps,
      optionOffset: dish.optionOffset,
      items: dish.items,
      subtotal: sumItems(dish.items),
      kcalBudget: mealKcalBudget,
    })
  }

  dayPlan = topUpDayPlanTowardTargets(
    dayPlan,
    { kcalTarget, proteinAim: macros?.proteinG ?? referents?.protein?.aim },
    catalog,
  )
  const totals = sumItems(dayPlan.flatMap((m) => m.items))

  return {
    ok: true,
    errors: [],
    plan: {
      version: 5,
      mealsPerDay: survey.mealsPerDay,
      proteinAccent,
      bmr: Math.round(bmr),
      tdee,
      kcalTarget,
      referents,
      macros,
      dayPlan,
      totals,
      basis: {
        weightKg: getHealthCurrentWeightKg(health),
        heightCm: Number(health?.height_cm),
        bmr: Math.round(bmr),
        tdee,
      },
      catalogSource: [...catalog.values()][0]?.source ?? 'builtin',
      builtSurveyKey: surveyBuildKey(survey),
      disclaimer:
        'Ориентировочный рацион, не является медицинским назначением. Уточняйте с врачом или нутрициологом при заболеваниях.',
    },
  }
}
