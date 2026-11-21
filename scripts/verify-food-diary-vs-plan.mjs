/**
 * Цели из рациона + факт vs план + строки «В дневник».
 * node scripts/verify-food-diary-vs-plan.mjs
 */
import {
  compareFoodDiaryToPlan,
  mergeFoodDiaryTargets,
  nutritionPlanTargetKcal,
  targetsFromNutritionPlan,
} from '../src/lib/client/foodDiaryVsPlanCore.js'
import {
  allocateFoodDiaryMealKey,
  filterFoodDiaryRowsByMealKeys,
  foodDiaryPlanMealOptions,
  foodDiaryRowsFromPlanDay,
  mealKeyFromPlanLabel,
  parseFoodDiaryFromPlanRequest,
  resolveFoodDiaryFromPlanConflict,
} from '../src/lib/client/foodDiaryFromPlanCore.js'
import {
  buildFoodDiaryRosterRow,
  filterFoodDiaryRosterRows,
  foodDiaryRosterChip,
} from '../src/lib/client/foodDiaryRosterCore.js'
import {
  foodDiaryPersonalTargetsFormSeed,
  parseFoodDiaryPersonalTargets,
  publicFoodDiaryPersonalTargets,
} from '../src/lib/client/foodDiaryPersonalTargetsCore.js'
import { FOOD_DIARY_DEFAULT_TARGETS } from '../src/lib/client/foodDiarySummaryCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(nutritionPlanTargetKcal({ kcal_target: 1800 }) === 1800, 'kcal_target')
ok(nutritionPlanTargetKcal({ totals: { kcal: 1700 } }) === 1700, 'totals.kcal')
ok(targetsFromNutritionPlan(null) === null, 'АЗ без рациона — нет целей')
const t = targetsFromNutritionPlan({
  kcal_target: 1900,
  totals: { proteinG: 120, fatG: 60, carbsG: 180 },
})
ok(t?.kcal === 1900 && t.protein_g === 120, 'цели БЖУ из рациона')
ok(mergeFoodDiaryTargets(null).kcal === FOOD_DIARY_DEFAULT_TARGETS.kcal, 'дефолты без плана')
ok(mergeFoodDiaryTargets(t).kcal === 1900, 'рацион важнее дефолта')
ok(
  mergeFoodDiaryTargets({ personal: { kcal: 1600, protein_g: 100 } }).kcal === 1600,
  'АЗ: свои цели важнее дефолта',
)
ok(
  mergeFoodDiaryTargets({ plan: t, personal: { kcal: 1600 } }).kcal === 1900,
  'ПЗ: рацион важнее своих',
)
ok(parseFoodDiaryPersonalTargets({ kcal: 500 }).ok === false, 'ккал слишком мало')
ok(parseFoodDiaryPersonalTargets({ kcal: 1800, protein_g: 120, fat_g: 55, carbs_g: 160 }).ok, 'свои цели ок')
ok(publicFoodDiaryPersonalTargets({ kcal: 1800, protein_g: 120 }).kcal === 1800, 'public targets')
ok(foodDiaryPersonalTargetsFormSeed(null).kcal === FOOD_DIARY_DEFAULT_TARGETS.kcal, 'seed дефолт')

ok(compareFoodDiaryToPlan({ kcal: 0 }, 1800).status === 'empty', 'пусто')
ok(compareFoodDiaryToPlan({ kcal: 1800 }, 1800).status === 'ok', 'в цели')
ok(compareFoodDiaryToPlan({ kcal: 100 }, null).status === 'no_plan', 'без плана')

ok(mealKeyFromPlanLabel('Завтрак') === 'breakfast', 'завтрак')
ok(mealKeyFromPlanLabel('Обед') === 'lunch', 'обед')
ok(mealKeyFromPlanLabel('Полдник') === 'extra_1', 'полдник')
ok(mealKeyFromPlanLabel('Второй завтрак') === 'extra_1', '2-й завтрак')
ok(allocateFoodDiaryMealKey('snack', new Set(['snack'])) === 'extra_1', 'занятый перекус → extra_1')

const payload = {
  kcal_target: 1800,
  meals: [
    {
      label: 'Завтрак',
      items: [{ label: 'Творог', grams: 150, kcal: 170, proteinG: 27, fatG: 5, carbsG: 5 }],
    },
    {
      label: 'Обед',
      items: [{ label: 'Курица', grams: 120, kcal: 200, proteinG: 35, fatG: 6, carbsG: 0 }],
    },
  ],
}
const rows = foodDiaryRowsFromPlanDay(payload, 0)
ok(rows.length === 2 && rows[0].meal_key === 'breakfast' && rows[1].name === 'Курица', 'строки из плана')

const conflict = resolveFoodDiaryFromPlanConflict('replace', ['breakfast'], rows)
ok(conflict.ok && conflict.delete_meal_keys.includes('breakfast'), 'replace чистит занятый приём')
ok(resolveFoodDiaryFromPlanConflict('add', ['breakfast'], rows).delete_meal_keys.length === 0, 'add не чистит')

const parsed = parseFoodDiaryFromPlanRequest(
  { entry_date: '2026-11-21', mode: 'add', plan_payload: payload },
  '2026-11-21',
)
ok(parsed.ok && parsed.rows.length === 2, 'parse from-plan')

const opts = foodDiaryPlanMealOptions(payload, 0)
ok(opts.length === 2 && opts[0].key === 'breakfast', 'опции приёмов')
ok(filterFoodDiaryRowsByMealKeys(rows, ['lunch']).length === 1, 'только обед')
const onlyLunch = parseFoodDiaryFromPlanRequest(
  { entry_date: '2026-11-21', mode: 'replace', plan_payload: payload, meal_keys: ['lunch'] },
  '2026-11-21',
)
ok(onlyLunch.ok && onlyLunch.rows.length === 1 && onlyLunch.rows[0].meal_key === 'lunch', 'parse meal_keys')
ok(
  parseFoodDiaryFromPlanRequest(
    { entry_date: '2026-11-21', mode: 'add', plan_payload: payload, meal_keys: [] },
    '2026-11-21',
  ).ok === false,
  'пустой meal_keys — ошибка',
)

const fivePlan = {
  meals: [
    { label: 'Завтрак', items: [{ label: 'A', kcal: 100, proteinG: 1, fatG: 0, carbsG: 0 }] },
    { label: 'Перекус', items: [{ label: 'B', kcal: 50, proteinG: 1, fatG: 0, carbsG: 0 }] },
    { label: 'Обед', items: [{ label: 'C', kcal: 200, proteinG: 1, fatG: 0, carbsG: 0 }] },
    { label: 'Полдник', items: [{ label: 'D', kcal: 80, proteinG: 1, fatG: 0, carbsG: 0 }] },
    { label: 'Ужин', items: [{ label: 'E', kcal: 180, proteinG: 1, fatG: 0, carbsG: 0 }] },
  ],
}
const fiveRows = foodDiaryRowsFromPlanDay(fivePlan, 0)
const fiveKeys = [...new Set(fiveRows.map((r) => r.meal_key))]
ok(fiveKeys.length === 5, '5 приёмов рациона → 5 разных meal_key')
ok(fiveKeys.includes('extra_1'), 'полдник → extra_1')

ok(foodDiaryRosterChip({ status: 'ok', fact_kcal: 1800 }) === 'ok', 'chip ok')
ok(foodDiaryRosterChip({ status: 'over', fact_kcal: 2200 }) === 'miss', 'chip miss')
ok(foodDiaryRosterChip({ status: 'empty', fact_kcal: 0 }) === 'empty', 'chip empty')
ok(foodDiaryRosterChip({ status: 'no_plan', fact_kcal: 500 }) === 'other', 'АЗ без плана — other')

const roster = [
  buildFoodDiaryRosterRow({ clientId: '1', name: 'Аня', totals: { kcal: 1800 }, planKcal: 1800 }),
  buildFoodDiaryRosterRow({ clientId: '2', name: 'Боря', totals: { kcal: 0 }, planKcal: 1800 }),
]
ok(filterFoodDiaryRosterRows(roster, 'empty').length === 1, 'фильтр пусто')
ok(filterFoodDiaryRosterRows(roster, 'ok')[0]?.name === 'Аня', 'фильтр в цели')

console.log('verify-food-diary-vs-plan: OK')
