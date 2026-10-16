/**
 * Смена блюда в одном слоте дня — без полной пересборки рациона.
 */
import { resolveSurveyProductPools } from './nutritionSurveyProductsCore.js'
import { buildMealForSlot, countMealOptionsForSlot } from './nutritionRecipesCore.js'
import { recalcPlanTotals } from './nutritionPlanEditCore.js'

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
 * @param {object} plan
 * @param {string} mealSlot
 * @param {object} ctx
 * @param {object} ctx.survey
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} ctx.catalogMap
 * @param {number} [ctx.direction] +1 следующее / −1 предыдущее
 * @returns {{ ok: true, plan: object } | { ok: false, error: string }}
 */
export function swapMealInPlan(plan, mealSlot, ctx) {
  if (!plan?.dayPlan?.length) return { ok: false, error: 'empty_plan' }
  const catalogMap = ctx?.catalogMap
  const survey = ctx?.survey ?? {}
  if (!catalogMap) return { ok: false, error: 'no_catalog' }

  const mealIndex = plan.dayPlan.findIndex((m) => m.slot === mealSlot)
  if (mealIndex < 0) return { ok: false, error: 'slot_not_found' }
  const meal = plan.dayPlan[mealIndex]
  const productIdsByGroup = resolveSurveyProductPools(survey, catalogMap)
  const optionCount = countMealOptionsForSlot(meal.slot, productIdsByGroup, catalogMap)
  if (optionCount < 2) return { ok: false, error: 'no_alternatives' }

  const direction = Number(ctx.direction) === -1 ? -1 : 1
  const prevOffset = Number(meal.optionOffset) || 0
  const nextOffset = prevOffset + direction

  const preferPrep = meal.prep === 'recipe' || meal.source === 'recipe' ? 'recipe' : 'base'
  const dish = buildMealForSlot({
    slotId: meal.slot,
    mealIndex,
    optionOffset: nextOffset,
    mealKcalBudget: meal.kcalBudget ?? Math.round((plan.kcalTarget ?? 2000) / (plan.dayPlan.length || 1)),
    productIdsByGroup,
    catalogMap,
    proteinAccent: survey.proteinAccent ?? plan.proteinAccent,
    preferPrep,
  })
  if (!dish?.items?.length) return { ok: false, error: 'build_failed' }

  const nextMeal = {
    ...meal,
    dishId: dish.dishId,
    dishLabel: dish.dishLabel,
    prep: dish.prep ?? preferPrep,
    source: dish.source === 'recipe' ? 'recipe' : 'base',
    recipeId: dish.recipeId,
    recipeSteps: dish.recipeSteps,
    optionOffset: nextOffset,
    items: dish.items,
    subtotal: sumItems(dish.items),
  }

  const dayPlan = plan.dayPlan.map((m, i) => (i === mealIndex ? nextMeal : m))
  let next = recalcPlanTotals({ ...plan, dayPlan })
  // Недельный план: синхронизировать активный день в days[]
  if (Array.isArray(plan.days) && plan.days.length) {
    const di = Math.max(0, Math.min(plan.days.length - 1, Number(plan.activeDayIndex) || 0))
    const days = plan.days.map((d, i) =>
      i === di ? { ...d, dayPlan: next.dayPlan, totals: next.totals } : d,
    )
    next = { ...next, days }
  }
  return { ok: true, plan: next }
}
