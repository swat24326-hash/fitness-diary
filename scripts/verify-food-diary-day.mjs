/**
 * День дневника калорий: приёмы, суммы, upsert, per100.
 * node scripts/verify-food-diary-day.mjs
 */
import {
  FOOD_DIARY_MEAL_KEYS,
  emptyFoodDiaryTotals,
  foodDiaryAddableMealKeys,
  foodDiaryMealLabel,
  foodDiaryNextAddableMealKey,
  foodDiaryOccupiedMealKeys,
  foodDiaryVisibleMealKeys,
  groupFoodDiaryByMeal,
  isFoodDiaryMealKey,
  parseFoodDiaryDate,
  parseFoodDiaryUpsert,
  publicFoodDiaryEntry,
  scaleMacrosFromPer100,
  shiftIsoDate,
  sumFoodDiaryDay,
} from '../src/lib/client/foodDiaryDayCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(FOOD_DIARY_MEAL_KEYS.length === 6, '6 приёмов (4+2)')
ok(foodDiaryMealLabel('lunch') === 'Обед', 'подпись обеда')
ok(foodDiaryMealLabel('extra_1') === 'Перекус 2', 'подпись extra_1')
ok(isFoodDiaryMealKey('extra_2'), 'extra_2 валиден')

ok(shiftIsoDate('2026-11-21', -1) === '2026-11-20', 'вчера')
ok(shiftIsoDate('2026-11-21', 1) === '2026-11-22', 'завтра')

const scaled = scaleMacrosFromPer100({ kcal: 100, protein_g: 10, fat_g: 5, carbs_g: 12 }, 50)
ok(scaled.kcal === 50 && scaled.protein_g === 5 && scaled.fat_g === 2.5 && scaled.carbs_g === 6, 'per100 × 50г')

const entries = [
  { id: '1', entry_date: '2026-11-21', meal_key: 'breakfast', name: 'Овсянка', grams: 200, kcal: 250, protein_g: 10, fat_g: 5, carbs_g: 40 },
  { id: '2', entry_date: '2026-11-21', meal_key: 'lunch', name: 'Курица', grams: 150, kcal: 220, protein_g: 40, fat_g: 6, carbs_g: 0 },
]
const tot = sumFoodDiaryDay(entries)
ok(tot.kcal === 470 && tot.protein_g === 50 && tot.count === 2, 'сумма дня')
ok(emptyFoodDiaryTotals().count === 0, 'пустой итог')

const by = groupFoodDiaryByMeal(entries)
ok(by.breakfast.length === 1 && by.dinner.length === 0 && by.lunch[0].name === 'Курица', 'группы приёмов')

ok(
  foodDiaryOccupiedMealKeys(entries).join(',') === 'breakfast,lunch',
  'занятые слоты из рациона/записей',
)
ok(foodDiaryVisibleMealKeys([], []).length === 0, 'пустой день без открытых')
ok(
  foodDiaryVisibleMealKeys(entries, []).join(',') === 'breakfast,lunch',
  'из рациона слоты сами на дне',
)
ok(
  foodDiaryVisibleMealKeys([], ['dinner']).join(',') === 'dinner',
  'кнопка «Добавить приём» открывает пустой слот',
)
ok(foodDiaryNextAddableMealKey([]) === 'breakfast', 'первый добавляемый — завтрак')
ok(foodDiaryNextAddableMealKey(['breakfast', 'lunch']) === 'dinner', 'следующий — обед→ужин')
ok(foodDiaryAddableMealKeys(FOOD_DIARY_MEAL_KEYS).length === 0, 'все 6 заняты — кнопки нет')

const pub = publicFoodDiaryEntry({ ...entries[0], client_id: 'x', club_id: 'c' })
ok(pub.id === '1' && !('client_id' in pub) && !('club_id' in pub), 'whitelist без id клуба/клиента')

ok(parseFoodDiaryDate('2026-11-22', '2026-11-21').ok === false, 'будущее нельзя')
ok(parseFoodDiaryDate('2026-11-21', '2026-11-21').ok === true, 'сегодня ок')

const up = parseFoodDiaryUpsert(
  { entry_date: '2026-11-21', meal_key: 'snack', name: 'Яблоко', grams: 120, kcal: 60, protein_g: 0.3, fat_g: 0.2, carbs_g: 14 },
  '2026-11-21',
)
ok(up.ok && up.name === 'Яблоко' && up.meal_key === 'snack', 'upsert порции')

const up100 = parseFoodDiaryUpsert(
  {
    entry_date: '2026-11-21',
    meal_key: 'breakfast',
    name: 'Творог',
    grams: 100,
    per_100: { kcal: 120, protein_g: 18, fat_g: 5, carbs_g: 3 },
  },
  '2026-11-21',
)
ok(up100.ok && up100.kcal === 120 && up100.protein_g === 18, 'upsert per100')

ok(parseFoodDiaryUpsert({ entry_date: '2026-11-21', meal_key: 'x', name: 'A', kcal: 1, protein_g: 0, fat_g: 0, carbs_g: 0 }, '2026-11-21').ok === false, 'плохой meal')
ok(
  parseFoodDiaryUpsert(
    { entry_date: '2026-11-21', meal_key: 'snack', name: 'A', kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    '2026-11-21',
  ).ok === false,
  'нули КБЖУ',
)

console.log('verify-food-diary-day: OK')
