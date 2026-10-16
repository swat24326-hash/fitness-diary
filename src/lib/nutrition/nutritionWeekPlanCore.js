/**
 * Рацион на несколько дней — дни разные (сдвиг индекса сборки), не копия понедельника.
 */
import { buildNutritionPlan } from './nutritionPlanBuilder.js'
import { clampDayCount } from './nutritionDaysCountCore.js'

/**
 * @param {object} health
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} [catalogMap]
 * @param {{ dayCount?: number, daySeedOffset?: number }} [opts]
 * @returns {{ ok: true, plan: object } | { ok: false, errors: string[], plan: null }}
 */
export function buildNutritionWeekPlan(health, survey, catalogMap, opts = {}) {
  const dayCount = clampDayCount(opts.dayCount ?? survey?.daysCount ?? 7)
  const baseSeed = Number(opts.daySeedOffset) || 0
  /** @type {object[]} */
  const days = []
  /** @type {string[]} */
  const errors = []

  let metaPlan = null
  for (let d = 0; d < dayCount; d++) {
    const shifted = buildNutritionPlanWithDayOffset(health, survey, catalogMap, baseSeed + d * 11, d)
    if (!shifted.ok || !shifted.plan) {
      errors.push(...(shifted.errors ?? [`День ${d + 1}: не собрался`]))
      continue
    }
    if (!metaPlan) metaPlan = shifted.plan
    days.push({
      dayIndex: d,
      label: dayLabel(d, dayCount),
      dayPlan: shifted.plan.dayPlan,
      totals: shifted.plan.totals,
      kcalTarget: shifted.plan.kcalTarget,
    })
  }

  if (!days.length || !metaPlan) {
    return { ok: false, errors: errors.length ? errors : ['Не удалось собрать ни одного дня'], plan: null }
  }

  return {
    ok: true,
    errors: [],
    plan: {
      ...metaPlan,
      version: 5,
      daysCount: days.length,
      days,
      dayPlan: days[0].dayPlan,
      totals: days[0].totals,
      kcalTarget: days[0].kcalTarget ?? metaPlan.kcalTarget,
      weekDistinct: daysAreDistinct(days),
    },
  }
}

/**
 * @param {object} health
 * @param {object} survey
 * @param {Map} catalogMap
 * @param {number} dayOffset
 */
export function buildNutritionPlanWithDayOffset(health, survey, catalogMap, dayOffset, dayIndex = 0) {
  return buildNutritionPlan(
    health,
    { ...survey, _mealIndexOffset: dayOffset, _dayIndex: dayIndex },
    catalogMap,
  )
}

export { clampDayCount } from './nutritionDaysCountCore.js'

function dayLabel(index, dayCount) {
  if (dayCount === 7) {
    const names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    return names[index] ?? `День ${index + 1}`
  }
  return `День ${index + 1}`
}

/**
 * @param {{ dayPlan: object[] }[]} days
 */
export function daysAreDistinct(days) {
  if ((days?.length ?? 0) < 2) return true
  const sig = (day) =>
    (day.dayPlan ?? [])
      .map((m) => `${m.dishId ?? ''}:${m.dishLabel ?? ''}`)
      .join('|')
  const first = sig(days[0])
  return days.some((d, i) => i > 0 && sig(d) !== first)
}

/**
 * @param {object} plan
 * @param {number} dayIndex
 */
export function pickWeekDayPlan(plan, dayIndex) {
  if (!plan?.days?.length) return plan
  const idx = Math.max(0, Math.min(plan.days.length - 1, Number(dayIndex) || 0))
  const day = plan.days[idx]
  return {
    ...plan,
    activeDayIndex: idx,
    dayPlan: day.dayPlan,
    totals: day.totals,
    kcalTarget: day.kcalTarget ?? plan.kcalTarget,
  }
}
