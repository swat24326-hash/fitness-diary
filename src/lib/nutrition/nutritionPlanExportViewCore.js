/**
 * Что кладём на PNG рациона: один день подробно или неделя компактным меню.
 * Полные граммы за неделю — в приложении клиента; в мессенджер — читаемая картинка.
 */

/**
 * @param {object|null|undefined} plan
 * @returns {{
 *   mode: 'day'|'week',
 *   daysCount: number,
 *   headline: string,
 *   days: Array<{
 *     label: string,
 *     totals: object|null,
 *     meals: Array<{ title: string, kcal: number|string|null, prep?: string }>,
 *     dayPlan?: object[],
 *   }>,
 * }}
 */
export function buildNutritionExportView(plan) {
  const weekDays = Array.isArray(plan?.days) && plan.days.length > 1 ? plan.days : null
  if (weekDays) {
    return {
      mode: 'week',
      daysCount: weekDays.length,
      headline: `МЕРНЫЙ РАЦИОН НА ${weekDays.length} ДН.`,
      days: weekDays.map((d) => ({
        label: String(d.label ?? '').trim() || 'День',
        totals: d.totals ?? null,
        meals: (d.dayPlan ?? []).map(mapMealLine),
      })),
    }
  }

  const dayPlan = Array.isArray(plan?.dayPlan) ? plan.dayPlan : []
  return {
    mode: 'day',
    daysCount: 1,
    headline: 'МЕРНЫЙ РАЦИОН НА ДЕНЬ',
    days: [
      {
        label: 'День',
        totals: plan?.totals ?? null,
        meals: dayPlan.map(mapMealLine),
        dayPlan,
      },
    ],
  }
}

function mapMealLine(meal) {
  const slot = String(meal?.label ?? '').trim()
  const dish = String(meal?.dishLabel ?? '').trim()
  const title = dish ? `${slot} · ${dish}` : slot || 'Приём'
  return {
    title,
    kcal: meal?.subtotal?.kcal ?? null,
    prep: meal?.prep === 'recipe' || meal?.source === 'recipe' ? 'recipe' : 'base',
  }
}
