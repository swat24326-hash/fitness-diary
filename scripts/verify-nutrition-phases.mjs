/**
 * Фазы 2–7: смена блюда, неделя, акцент, rescale, авто-push.
 */
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { buildNutritionPlan } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import { buildNutritionWeekPlan, daysAreDistinct, pickWeekDayPlan } from '../src/lib/nutrition/nutritionWeekPlanCore.js'
import { swapMealInPlan } from '../src/lib/nutrition/nutritionMealSwapCore.js'
import { orderProteinIdsByAccent, proteinAccentForWeek } from '../src/lib/nutrition/nutritionProteinAccentCore.js'
import { rescaleNutritionPlanToHealth } from '../src/lib/nutrition/nutritionPlanRescaleCore.js'
import { shouldAutoPushNutritionPlan } from '../src/lib/nutrition/nutritionAutoPushCore.js'
import { NUTRITION_PRODUCT_CATALOG } from '../src/lib/nutrition/nutritionProductCatalog.js'
import { setPlanItemGrams } from '../src/lib/nutrition/nutritionPlanEditCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalog = buildNutritionCatalogMap([])
const health = { height_cm: 170, weight_kg: 75, sex: 'male', goal: 'форма' }
const survey = {
  age: 30,
  activityLevel: 'moderate',
  goalKind: 'lose',
  mealsPerDay: 4,
  exclusions: [],
  productSelectMode: 'avoid',
  avoidProductIds: [],
  proteinAccent: 'chicken',
  daysCount: 1,
}

const one = buildNutritionPlan(health, survey, catalog)
ok(one.ok, 'single day builds')
ok(one.plan?.dayPlan?.length === 4, '4 meals')

const chickenPlan = buildNutritionPlan(health, { ...survey, proteinAccent: 'chicken' }, catalog)
const fishPlan = buildNutritionPlan(health, { ...survey, proteinAccent: 'fish' }, catalog)
const mains = (plan) =>
  (plan?.dayPlan ?? [])
    .filter((m) => m.label === 'Обед' || m.label === 'Ужин')
    .map((m) => `${m.dishLabel}|${(m.items ?? []).map((i) => i.label).join(',')}`)
    .join(' ;; ')
const chickenMains = mains(chickenPlan.plan)
const fishMains = mains(fishPlan.plan)
ok(/Куриц|куриц|Индейк/i.test(chickenMains), `chicken accent on mains: ${chickenMains}`)
ok(/рыб|Минтай|Белая рыба|Лосос|Тунец/i.test(fishMains), `fish accent on mains: ${fishMains}`)
ok(chickenMains !== fishMains, 'chicken vs fish accents differ')

const maxChicken = Math.max(
  0,
  ...(one.plan?.dayPlan ?? []).flatMap((m) =>
    (m.items ?? []).filter((i) => /грудк|индейк|говядин/i.test(i.label)).map((i) => i.grams ?? 0),
  ),
)
ok(maxChicken <= 220, `meat portion ≤220g (got ${maxChicken})`)

const maxPasta = Math.max(
  0,
  ...(one.plan?.dayPlan ?? []).flatMap((m) =>
    (m.items ?? []).filter((i) => /Макарон/i.test(i.label)).map((i) => i.grams ?? 0),
  ),
)
ok(maxPasta <= 250, `pasta portion ≤250g (got ${maxPasta || 0})`)

const lactosePlan = buildNutritionPlan(health, { ...survey, exclusions: ['lactose'] }, catalog)
ok(lactosePlan.ok, 'lactose-free plan builds')
const lactoseLabels = (lactosePlan.plan?.dayPlan ?? [])
  .flatMap((m) => (m.items ?? []).map((i) => i.label))
  .join('|')
ok(!/масло сливочн|творог|йогурт|кефир|молоко|ряженк/i.test(lactoseLabels), `no dairy/lactose in plan: ${lactoseLabels}`)

const swap = swapMealInPlan(one.plan, one.plan.dayPlan[0].slot, { survey, catalogMap: catalog })
ok(swap.ok, 'swap meal ok')
ok(
  swap.plan.dayPlan[0].dishId !== one.plan.dayPlan[0].dishId ||
    swap.plan.dayPlan[0].dishLabel !== one.plan.dayPlan[0].dishLabel ||
    (swap.plan.dayPlan[0].optionOffset ?? 0) !== (one.plan.dayPlan[0].optionOffset ?? 0),
  'swap changes option',
)

const week = buildNutritionWeekPlan(health, { ...survey, daysCount: 5, proteinAccent: 'fish' }, catalog)
ok(week.ok, 'week plan builds')
ok(week.plan?.days?.length === 5, '5 days')
ok(week.plan.weekDistinct === true || daysAreDistinct(week.plan.days), 'days distinct')
const day2 = pickWeekDayPlan(week.plan, 2)
ok(day2.dayPlan?.length > 0, 'pick day 2')
const week7 = buildNutritionWeekPlan(health, { ...survey, daysCount: 7 }, catalog)
ok(week7.ok && week7.plan?.days?.length === 7, '7-day week (Неделя)')
ok(daysAreDistinct(week7.plan?.days ?? []), '7 days not clones of Monday')
const monItem = week7.plan.days[0].dayPlan[0]?.items?.[0]
if (monItem) {
  const targetG = monItem.grams === 55 ? 40 : 55
  const edited = setPlanItemGrams(week7.plan, catalog, week7.plan.days[0].dayPlan[0].slot, monItem.productId, targetG, {
    dayIndex: 0,
  })
  ok(
    edited.days?.[0]?.dayPlan?.[0]?.items?.some((i) => i.productId === monItem.productId && i.grams === targetG),
    'gram edit syncs into days[0]',
  )
  const editedItem = edited.days?.[0]?.dayPlan?.[0]?.items?.find((i) => i.productId === monItem.productId)
  ok(editedItem && editedItem.kcal !== monItem.kcal, 'gram edit recalculates item kcal')
  ok(edited.days?.[0]?.totals?.kcal !== week7.plan.days[0].totals?.kcal, 'gram edit recalculates day totals')
  ok(
    edited.days?.[1]?.dayPlan?.[0]?.items?.[0]?.grams === week7.plan.days[1].dayPlan[0]?.items?.[0]?.grams,
    'gram edit does not wipe other week days',
  )

  // Клубной карте нет builtin-id из старого рациона — ищем по названию / запасной пересчёт.
  const clubOnly = new Map([
    [
      'uuid-other',
      {
        id: 'uuid-other',
        label: monItem.label,
        group: 'protein',
        proteinPer100: 20,
        fatPer100: 5,
        carbsPer100: 0,
        source: 'club',
      },
    ],
  ])
  const labelTarget = targetG === 60 ? 45 : 60
  const byLabel = setPlanItemGrams(week7.plan, clubOnly, week7.plan.days[0].dayPlan[0].slot, monItem.productId, labelTarget, {
    dayIndex: 0,
  })
  const byLabelItem = byLabel.days?.[0]?.dayPlan?.[0]?.items?.find((i) => i.productId === monItem.productId)
  ok(byLabelItem?.grams === labelTarget && byLabelItem.kcal > 0, 'gram edit resolves club product by label')

  const emptyMap = new Map()
  const scaleTarget = monItem.grams === 40 ? 25 : 40
  const scaled = setPlanItemGrams(week7.plan, emptyMap, week7.plan.days[0].dayPlan[0].slot, monItem.productId, scaleTarget, {
    dayIndex: 0,
  })
  const scaledItem = scaled.days?.[0]?.dayPlan?.[0]?.items?.find((i) => i.productId === monItem.productId)
  ok(
    scaledItem?.grams === scaleTarget &&
      scaledItem.kcal !== monItem.kcal &&
      scaled.days?.[0]?.totals?.kcal !== week7.plan.days[0].totals?.kcal,
    'gram edit without catalog scales macros and totals',
  )
}

const ordered = orderProteinIdsByAccent(
  ['beef_lean', 'chicken_breast', 'fish_white'],
  'chicken',
)
ok(ordered[0] === 'chicken_breast', 'accent chicken first')
ok(proteinAccentForWeek(['chicken', 'fish'], '2026-01-05', '2026-01-12') === 'fish', 'week rotation')

const heavy = { ...health, weight_kg: 90 }
const scaled = rescaleNutritionPlanToHealth(one.plan, heavy, survey, catalog)
ok(scaled.ok, 'rescale ok')
ok(scaled.plan.kcalTarget !== one.plan.kcalTarget, 'kcal target changed with weight')
ok(scaled.plan.dayPlan[0].dishId === one.plan.dayPlan[0].dishId, 'dish kept after rescale')

const weekHeavy = rescaleNutritionPlanToHealth(week7.plan, heavy, { ...survey, daysCount: 7 }, catalog)
ok(weekHeavy.ok, 'week rescale ok')
ok(weekHeavy.plan.days?.length === 7, 'week rescale keeps 7 days')
ok(weekHeavy.plan.kcalTarget !== week7.plan.kcalTarget, 'week rescale changes root kcalTarget')
ok(
  weekHeavy.plan.days.every((d) => d.kcalTarget === weekHeavy.plan.kcalTarget),
  'week rescale: each day gets new kcalTarget',
)
ok(
  weekHeavy.plan.days[0].dayPlan[0].dishId === week7.plan.days[0].dayPlan[0].dishId &&
    weekHeavy.plan.days[3].dayPlan[0].dishId === week7.plan.days[3].dayPlan[0].dishId,
  'week rescale keeps dishes on day 0 and day 3',
)
ok(
  weekHeavy.plan.dayPlan[0].dishId === weekHeavy.plan.days[0].dayPlan[0].dishId,
  'week rescale: root dayPlan matches days[0]',
)

const light = { ...health, weight_kg: 60 }
const weekLight = rescaleNutritionPlanToHealth(week7.plan, light, { ...survey, daysCount: 7 }, catalog)
ok(weekLight.ok, 'week rescale down ok')
ok(weekLight.plan.kcalTarget < week7.plan.kcalTarget, 'lower weight → lower kcalTarget')
const day3Down = weekLight.plan.days[3].totals?.kcal
const day3Orig = week7.plan.days[3].totals?.kcal
ok(
  day3Orig > 0 && day3Down > 0 && day3Down < day3Orig,
  `week rescale down shrinks day 3 (${day3Orig} → ${day3Down})`,
)

ok(
  shouldAutoPushNutritionPlan({
    enabled: true,
    health: heavy,
    plan: scaled.plan,
    planUnsaved: false,
    trigger: 'manual_recalc',
  }).shouldPush,
  'auto push after recalc',
)
ok(
  !shouldAutoPushNutritionPlan({
    enabled: false,
    health,
    plan: one.plan,
    planUnsaved: false,
    trigger: 'manual_recalc',
  }).shouldPush,
  'auto push off when disabled',
)

ok(NUTRITION_PRODUCT_CATALOG.length >= 50, `catalog ${NUTRITION_PRODUCT_CATALOG.length}`)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition phase checks passed')
