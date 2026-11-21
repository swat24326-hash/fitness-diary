/**
 * Сводка КБЖУ / соли / клетчатки (уровень FatSecret Premium).
 * node scripts/verify-food-diary-summary.mjs
 */
import { sumFoodDiaryDay } from '../src/lib/client/foodDiaryDayCore.js'
import {
  FOOD_DIARY_DEFAULT_TARGETS,
  buildFoodDiarySummary,
  formatNutrientValueRu,
  macroKcalSharePct,
  sodiumMgToSaltG,
} from '../src/lib/client/foodDiarySummaryCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(FOOD_DIARY_DEFAULT_TARGETS.sodium_mg === 2300, 'цель натрия')
ok(sodiumMgToSaltG(1000) === 2.5, 'натрий → соль')
ok(formatNutrientValueRu(12.5) === '12,5', 'формат ru')

const macros = { protein_g: 50, fat_g: 20, carbs_g: 40 }
/* 50*4 + 20*9 + 40*4 = 200+180+160 = 540; белок 200/540 ≈ 37% */
ok(macroKcalSharePct(50, 'protein_g', macros) === 37, 'доля белка')

const entries = [
  {
    kcal: 280,
    protein_g: 12,
    fat_g: 6,
    carbs_g: 45,
    fiber_g: 6,
    sugar_g: 12,
    sodium_mg: 80,
  },
  {
    kcal: 420,
    protein_g: 45,
    fat_g: 8,
    carbs_g: 40,
    fiber_g: 2,
    sugar_g: 1,
    sodium_mg: 420,
  },
]
const tot = sumFoodDiaryDay(entries)
ok(tot.kcal === 700 && tot.fiber_g === 8 && tot.sodium_mg === 500, 'сумма extras')

const s = buildFoodDiarySummary(tot)
ok(s.kcal.value === 700 && s.kcal.target === 2000, 'ккал сводки')
ok(s.macros.length === 3 && s.macros[0].short === 'Б', 'макросы')
ok(s.extras.some((x) => x.key === 'sodium_mg' && x.hint.includes('соль')), 'натрий + соль')
ok(s.extras.find((x) => x.key === 'fiber_g')?.value === 8, 'клетчатка в сводке')

console.log('verify-food-diary-summary: OK')
