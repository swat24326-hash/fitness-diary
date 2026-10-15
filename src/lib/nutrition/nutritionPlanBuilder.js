import { getHealthCurrentWeightKg } from '../clientWeightCore.js'
import { getHealthSex } from '../healthCardCore.js'
import { filterCatalogProductsByExclusions, buildNutritionCatalogMap } from './nutritionCatalogResolve.js'
import { computeBmr, computeTdee } from './nutritionMacrosCore.js'
import { getMealSlots } from './nutritionMealSlotsCore.js'
import { buildMealFromDish } from './nutritionDishBuildCore.js'
import {
  computeNutritionReferents,
  macroTargetsFromReferents,
} from './nutritionReferentsCore.js'
import { surveyBuildKey } from './nutritionPlanSessionCore.js'

/**
 * @typedef {object} NutritionSurvey
 * @property {number} [age]
 * @property {import('./nutritionMacrosCore.js').NutritionActivityLevel} [activityLevel]
 * @property {import('./nutritionMacrosCore.js').NutritionGoalKind} [goalKind]
 * @property {number} [mealsPerDay]
 * @property {string[]} [exclusions]
 * @property {{ protein?: string[], fat?: string[], carbs?: string[] }} [pickedProducts]
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
  return {
    age: Number.isFinite(Number(o.age)) ? Number(o.age) : undefined,
    activityLevel: typeof o.activityLevel === 'string' ? o.activityLevel : undefined,
    goalKind: typeof o.goalKind === 'string' ? o.goalKind : undefined,
    mealsPerDay: meals >= 3 && meals <= 6 ? meals : undefined,
    exclusions: Array.isArray(o.exclusions) ? o.exclusions.map(String) : [],
    pickedProducts,
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

export function validateSurveyForBuild(survey) {
  const errors = []
  if (!survey.age || survey.age < 14 || survey.age > 90) errors.push('Укажите возраст (14–90)')
  if (!survey.activityLevel) errors.push('Укажите активность')
  if (!survey.goalKind) errors.push('Укажите цель')
  if (!survey.mealsPerDay) errors.push('Укажите число приёмов пищи')
  const pp = survey.pickedProducts ?? {}
  if (!pp.protein?.length) errors.push('Выберите источники белка')
  if (!pp.fat?.length) errors.push('Выберите источники жиров')
  if (!pp.carbs?.length) errors.push('Выберите источники углеводов')
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
  const errors = validateSurveyForBuild(survey)
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

  const pp = survey.pickedProducts ?? {}
  const productIdsByGroup = {
    protein: filterCatalogProductsByExclusions(pp.protein ?? [], survey.exclusions, catalog),
    fat: filterCatalogProductsByExclusions(pp.fat ?? [], survey.exclusions, catalog),
    carbs: filterCatalogProductsByExclusions(pp.carbs ?? [], survey.exclusions, catalog),
  }
  if (!productIdsByGroup.protein.length || !productIdsByGroup.fat.length || !productIdsByGroup.carbs.length) {
    return { ok: false, errors: ['После исключений не осталось продуктов в одной из групп'], plan: null }
  }

  const slots = getMealSlots(survey.mealsPerDay)
  /** @type {object[]} */
  const dayPlan = []
  for (let idx = 0; idx < slots.length; idx++) {
    const slot = slots[idx]
    const mealKcalBudget = Math.round(kcalTarget * slot.ratio)
    const dish = buildMealFromDish({
      slotId: slot.id,
      mealIndex: idx,
      mealKcalBudget,
      productIdsByGroup,
      catalogMap: catalog,
    })
    if (!dish?.items?.length) {
      return {
        ok: false,
        errors: [`Не удалось собрать блюдо для «${slot.label}» — расширьте выбор продуктов`],
        plan: null,
      }
    }
    dayPlan.push({
      slot: slot.id,
      label: slot.label,
      dishId: dish.dishId,
      dishLabel: dish.dishLabel,
      items: dish.items,
      subtotal: sumItems(dish.items),
      kcalBudget: mealKcalBudget,
    })
  }

  const totals = sumItems(dayPlan.flatMap((m) => m.items))

  return {
    ok: true,
    errors: [],
    plan: {
      version: 3,
      mealsPerDay: survey.mealsPerDay,
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
