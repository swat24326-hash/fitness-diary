/**
 * Часто ем + копирование дня + вода + неделя + vs plan.
 * node scripts/verify-food-diary-habits.mjs
 */
import { buildCopiedFoodDiaryRows, buildFrequentFoods, parseFoodDiaryCopyDates } from '../src/lib/client/foodDiaryHabitsCore.js'
import {
  FOOD_DIARY_WATER_DEFAULT_TARGET_ML,
  clampWaterAdd,
  foodDiaryWaterProgressPct,
  parseFoodDiaryWaterMl,
} from '../src/lib/client/foodDiaryWaterCore.js'
import { buildFoodDiaryWeekSeries, foodDiaryWeekRangeEnding } from '../src/lib/client/foodDiaryWeekCore.js'
import { compareFoodDiaryToPlan, nutritionPlanTargetKcal } from '../src/lib/client/foodDiaryVsPlanCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

const hist = [
  { name: 'Овсянка', kcal: 200, protein_g: 8, fat_g: 4, carbs_g: 30, grams: 200 },
  { name: 'овсянка', kcal: 210, protein_g: 9, fat_g: 4, carbs_g: 32, grams: 210 },
  { name: 'Курица', kcal: 180, protein_g: 30, fat_g: 5, carbs_g: 0, grams: 120 },
]
const freq = buildFrequentFoods(hist, { limit: 2 })
ok(freq[0].name === 'Овсянка' && freq[0].count === 2, 'часто ем топ')

const copyDates = parseFoodDiaryCopyDates('2026-11-20', '2026-11-21', '2026-11-21')
ok(copyDates.ok, 'даты копии')
ok(parseFoodDiaryCopyDates('2026-11-21', '2026-11-21', '2026-11-21').ok === false, 'тот же день нельзя')

const built = buildCopiedFoodDiaryRows(
  [
    {
      id: '1',
      entry_date: '2026-11-20',
      meal_key: 'breakfast',
      name: 'Овсянка',
      grams: 200,
      kcal: 200,
      protein_g: 8,
      fat_g: 4,
      carbs_g: 30,
    },
    {
      id: '2',
      entry_date: '2026-11-20',
      meal_key: 'lunch',
      name: 'Курица',
      grams: 120,
      kcal: 180,
      protein_g: 30,
      fat_g: 5,
      carbs_g: 0,
    },
  ],
  '2026-11-21',
  { meal_key: 'breakfast' },
)
ok(built.ok && built.rows.length === 1 && built.rows[0].entry_date === '2026-11-21', 'копия завтрака')

ok(parseFoodDiaryWaterMl(-1).ok === false, 'вода отрицательная')
ok(parseFoodDiaryWaterMl(500).ok && parseFoodDiaryWaterMl(500).ml === 500, 'вода 500')
ok(clampWaterAdd(1900, 250) === 2150, 'вода +250')
ok(foodDiaryWaterProgressPct(1000) === 50, 'вода 50% к 2л')
ok(FOOD_DIARY_WATER_DEFAULT_TARGET_ML === 2000, 'цель воды')

const range = foodDiaryWeekRangeEnding('2026-11-21')
ok(range.ok && range.from === '2026-11-15' && range.dates.length === 7, 'неделя end-6')
const series = buildFoodDiaryWeekSeries(
  [
    { entry_date: '2026-11-20', kcal: 100, protein_g: 0, fat_g: 0, carbs_g: 0 },
    { entry_date: '2026-11-21', kcal: 300, protein_g: 0, fat_g: 0, carbs_g: 0 },
  ],
  range.dates,
)
ok(series.daysWithFood === 2 && series.avgKcal === 200, 'средние ккал недели')

ok(nutritionPlanTargetKcal({ target_kcal: 1800 }) === 1800, 'цель из плана')
ok(nutritionPlanTargetKcal({ totals: { kcal: 1700 } }) === 1700, 'цель из totals')
const vs = compareFoodDiaryToPlan({ kcal: 2200 }, 1800)
ok(vs.has_plan && vs.status === 'over', 'выше цели')
ok(compareFoodDiaryToPlan({ kcal: 0 }, 1800).status === 'empty', 'пустой день')
ok(compareFoodDiaryToPlan({ kcal: 100 }, null).status === 'no_plan', 'без плана')

console.log('verify-food-diary-habits: OK')
