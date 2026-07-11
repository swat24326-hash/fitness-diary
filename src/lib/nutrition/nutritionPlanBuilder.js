import { getHealthCurrentWeightKg } from '../clientWeightCore.js'
import { getHealthSex } from '../healthCardCore.js'
import { filterCatalogProductsByExclusions, resolveCatalogProduct, buildNutritionCatalogMap } from './nutritionCatalogResolve.js'
import {
  computeBmr,
  computeKcalTarget,
  computeMacroTargets,
  computeTdee,
  formatProductPortion,
  GOAL_MACRO_PCT,
  gramsForKcal,
  macrosForGrams,
  roundGrams,
} from './nutritionMacrosCore.js'
import { getMealSlots } from './nutritionMealSlotsCore.js'
import { clampProductGrams, pickFatProductId, pickProteinProductId } from './nutritionMealPairingCore.js'

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

function pickProductId(ids, mealIndex) {
  if (!ids?.length) return null
  return ids[mealIndex % ids.length]
}

function scaleMealItemsToBudget(items, mealKcalBudget) {
  const subtotal = sumItems(items)
  if (!subtotal.kcal || subtotal.kcal <= mealKcalBudget * 1.05) return items
  const factor = mealKcalBudget / subtotal.kcal
  return items.map((item) => {
    const grams = roundGrams((item.grams ?? 0) * factor)
    return { ...item, grams, portionLabel: `${grams} г` }
  })
}

function buildItemFromKcal(product, productId, kcalShare) {
  if (!product || kcalShare <= 0) return null
  let grams = gramsForKcal(product, kcalShare)
  grams = clampProductGrams(productId, grams, product)
  const portion = formatProductPortion(product, grams)
  const m = macrosForGrams(product, portion.grams)
  return {
    productId: product.id,
    label: product.label,
    grams: portion.grams,
    portionLabel: portion.display,
    ...m,
  }
}

/**
 * Сборка приёма пищи по калорийному бюджету + правила сочетаний.
 */
function buildMealItems(mealIndex, mealKcalBudget, goalKind, productIdsByGroup, catalogMap) {
  const macroPct = GOAL_MACRO_PCT[goalKind] ?? GOAL_MACRO_PCT.maintain
  const proteinKcal = mealKcalBudget * macroPct.protein
  const fatKcal = mealKcalBudget * macroPct.fat
  const carbsKcal = mealKcalBudget * macroPct.carbs

  const carbsId = pickProductId(productIdsByGroup.carbs, mealIndex)
  const proteinId = pickProteinProductId(carbsId, productIdsByGroup.protein, mealIndex, catalogMap)
  const fatId = pickFatProductId(carbsId, productIdsByGroup.fat, mealIndex, catalogMap)

  const rawItems = []
  const protein = proteinId ? resolveCatalogProduct(catalogMap, proteinId) : null
  const carbs = carbsId ? resolveCatalogProduct(catalogMap, carbsId) : null
  const fat = fatId ? resolveCatalogProduct(catalogMap, fatId) : null

  const proteinItem = buildItemFromKcal(protein, proteinId, proteinKcal)
  if (proteinItem) rawItems.push(proteinItem)
  const carbsItem = buildItemFromKcal(carbs, carbsId, carbsKcal)
  if (carbsItem) rawItems.push(carbsItem)
  const fatItem = buildItemFromKcal(fat, fatId, fatKcal)
  if (fatItem) rawItems.push(fatItem)

  const scaled = scaleMealItemsToBudget(rawItems, mealKcalBudget)
  const catalog = catalogMap
  return scaled.map((item) => {
    const p = resolveCatalogProduct(catalog, item.productId)
    if (!p) return item
    const portion = formatProductPortion(p, item.grams)
    const m = macrosForGrams(p, portion.grams)
    return {
      productId: item.productId,
      label: item.label,
      grams: portion.grams,
      portionLabel: portion.display,
      ...m,
    }
  })
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
  const kcalTarget = computeKcalTarget(tdee, /** @type {import('./nutritionMacrosCore.js').NutritionGoalKind} */ (basics.goalKind))
  const macros = computeMacroTargets(kcalTarget, /** @type {import('./nutritionMacrosCore.js').NutritionGoalKind} */ (basics.goalKind))

  const pp = survey.pickedProducts ?? {}
  const productIdsByGroup = {
    protein: filterCatalogProductsByExclusions(pp.protein ?? [], survey.exclusions, catalog),
    fat: filterCatalogProductsByExclusions(pp.fat ?? [], survey.exclusions, catalog),
    carbs: filterCatalogProductsByExclusions(pp.carbs ?? [], survey.exclusions, catalog),
  }
  if (!productIdsByGroup.protein.length || !productIdsByGroup.fat.length || !productIdsByGroup.carbs.length) {
    return { ok: false, errors: ['После исключений не осталось продуктов в одной из групп'], plan: null }
  }

  const goalKind = /** @type {import('./nutritionMacrosCore.js').NutritionGoalKind} */ (basics.goalKind)
  const slots = getMealSlots(survey.mealsPerDay)
  const dayPlan = slots.map((slot, idx) => {
    const mealKcalBudget = Math.round(kcalTarget * slot.ratio)
    const items = buildMealItems(idx, mealKcalBudget, goalKind, productIdsByGroup, catalog)
    return {
      slot: slot.id,
      label: slot.label,
      items,
      subtotal: sumItems(items),
      kcalBudget: mealKcalBudget,
    }
  })

  const totals = sumItems(dayPlan.flatMap((m) => m.items))

  return {
    ok: true,
    errors: [],
    plan: {
      version: 2,
      mealsPerDay: survey.mealsPerDay,
      bmr: Math.round(bmr),
      tdee,
      kcalTarget,
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
      disclaimer:
        'Ориентировочный рацион, не является медицинским назначением. Уточняйте с врачом или нутрициологом при заболеваниях.',
    },
  }
}
