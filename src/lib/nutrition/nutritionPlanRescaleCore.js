/**
 * Пересчёт КБЖУ при смене веса: те же блюда/состав, новые граммы под новую цель ккал.
 * Недельный план — масштабирует каждый день в days[], не только активный dayPlan.
 */
import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import {
  computeBmr,
  computeTdee,
  formatProductPortion,
  macrosForGrams,
  roundGrams,
} from './nutritionMacrosCore.js'
import { clampProductGrams } from './nutritionMealPairingCore.js'
import { computeNutritionReferents, macroTargetsFromReferents } from './nutritionReferentsCore.js'
import { getNutritionHealthBasics, isNutritionHealthReady, normalizeNutritionSurvey } from './nutritionPlanBuilder.js'
import { getHealthCurrentWeightKg } from '../clientWeightCore.js'
import { recalcPlanTotals } from './nutritionPlanEditCore.js'

/**
 * Масштабировать граммы в приёме под новый бюджет ккал (сохраняя доли продуктов).
 * @param {object[]} items
 * @param {number} mealKcalBudget
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function scaleMealItemsToKcalBudget(items, mealKcalBudget, catalogMap) {
  const list = items ?? []
  if (!list.length || !(mealKcalBudget > 0)) return list
  const cur = list.reduce((s, it) => s + (it.kcal ?? 0), 0)
  if (!(cur > 0)) return list
  const factor = mealKcalBudget / cur
  return list.map((it) => {
    const p = resolveCatalogProduct(catalogMap, it.productId)
    if (!p) return it
    const grams = clampProductGrams(it.productId, roundGrams((it.grams ?? 0) * factor), p)
    const portion = formatProductPortion(p, grams)
    const m = macrosForGrams(p, portion.grams)
    return {
      ...it,
      grams: portion.grams,
      portionLabel: portion.display,
      ...m,
      userEdited: false,
    }
  })
}

/**
 * @param {object[]} dayPlan
 * @param {number} oldTarget
 * @param {number} kcalTarget
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function rescaleDayPlanToKcal(dayPlan, oldTarget, kcalTarget, catalogMap) {
  const meals = dayPlan ?? []
  if (!meals.length || !(kcalTarget > 0)) return meals
  const base = oldTarget > 0 ? oldTarget : meals.reduce((s, m) => s + (m.kcalBudget ?? 0), 0) || kcalTarget
  return meals.map((meal) => {
    const ratio = meal.kcalBudget > 0 ? meal.kcalBudget / base : 1 / meals.length
    const mealKcalBudget = Math.round(kcalTarget * ratio)
    const items = scaleMealItemsToKcalBudget(meal.items ?? [], mealKcalBudget, catalogMap)
    return {
      ...meal,
      items,
      kcalBudget: mealKcalBudget,
    }
  })
}

/**
 * @param {object} plan — сохранённый/черновой рацион
 * @param {object} health — актуальная карточка здоровья
 * @param {object} survey
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @returns {{ ok: true, plan: object } | { ok: false, errors: string[] }}
 */
export function rescaleNutritionPlanToHealth(plan, health, survey, catalogMap) {
  const hasWeek = Array.isArray(plan?.days) && plan.days.length > 0
  if (!plan?.dayPlan?.length && !hasWeek) {
    return { ok: false, errors: ['Нет рациона для пересчёта'] }
  }
  if (!isNutritionHealthReady(health)) {
    return { ok: false, errors: ['Заполните рост, вес и пол во вкладке «Здоровье»'] }
  }
  const s = normalizeNutritionSurvey(survey)
  const basics = getNutritionHealthBasics(health, s)
  const bmr = computeBmr({
    sex: basics.sex,
    age: basics.age ?? plan.basis?.age,
    weightKg: basics.weightKg,
    heightCm: basics.heightCm,
  })
  const activity = /** @type {import('./nutritionMacrosCore.js').NutritionActivityLevel} */ (
    basics.activityLevel ?? 'moderate'
  )
  const tdee = computeTdee(bmr, activity)
  const referents = computeNutritionReferents({
    sex: basics.sex,
    age: basics.age,
    weightKg: basics.weightKg,
    heightCm: basics.heightCm,
    activityLevel: activity,
    goalKind: basics.goalKind ?? 'maintain',
  })
  const kcalTarget = referents?.kcal.aim ?? tdee
  const macros = macroTargetsFromReferents(referents)
  const oldTarget = plan.kcalTarget > 0 ? plan.kcalTarget : plan.totals?.kcal || kcalTarget

  const di = Math.max(
    0,
    Math.min(hasWeek ? plan.days.length - 1 : 0, Number(plan.activeDayIndex) || 0),
  )

  /** @type {object[] | undefined} */
  let days
  /** @type {object[]} */
  let dayPlan

  if (hasWeek) {
    days = plan.days.map((d) => {
      const scaledMeals = rescaleDayPlanToKcal(d.dayPlan ?? [], d.kcalTarget || oldTarget, kcalTarget, catalogMap)
      const shell = recalcPlanTotals({ dayPlan: scaledMeals })
      return {
        ...d,
        dayPlan: shell.dayPlan,
        totals: shell.totals,
        kcalTarget,
      }
    })
    dayPlan = days[di]?.dayPlan ?? []
  } else {
    dayPlan = rescaleDayPlanToKcal(plan.dayPlan, oldTarget, kcalTarget, catalogMap)
  }

  const next = recalcPlanTotals({
    ...plan,
    version: Math.max(hasWeek ? 5 : 4, Number(plan.version) || (hasWeek ? 5 : 4)),
    bmr: Math.round(bmr),
    tdee,
    kcalTarget,
    referents,
    macros,
    ...(days ? { days, daysCount: days.length, activeDayIndex: di } : {}),
    dayPlan,
    basis: {
      weightKg: getHealthCurrentWeightKg(health),
      heightCm: Number(health?.height_cm),
      bmr: Math.round(bmr),
      tdee,
    },
    rescaledAt: new Date().toISOString(),
  })

  return { ok: true, plan: next }
}
