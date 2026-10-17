/**
 * Авто-рацион по воскресеньям: порог веса 3 кг, паузы, постоянный id, сборка снимка.
 */
import {
  NUTRITION_AUTO_HOLD_RU,
  NUTRITION_AUTO_WEIGHT_KG,
  buildNutritionAutoPlan,
  buildNutritionAutoTrainerPush,
  nutritionAutoHoldReason,
  nutritionAutoNeedsRescale,
  nutritionAutoPlanId,
  nutritionAutoPrefsFromSurvey,
  nutritionAutoTrainerCardPath,
  nutritionAutoWeightDeltaKg,
} from '../src/lib/nutrition/nutritionAutoScheduleCore.js'
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { normalizeClientPlanPushPayload } from '../src/lib/clientPlans/clientPlanCore.js'
import { runNutritionAutoSend } from '../api/_lib/nutritionAuto/nutritionAutoJob.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const U = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const SUN = '2026-10-18'
const C1 = U(11)
const TRAINER = U(1)

ok(NUTRITION_AUTO_WEIGHT_KG === 3, 'порог 3 кг')
ok(nutritionAutoPlanId(C1, SUN) === nutritionAutoPlanId(C1, SUN), 'id стабильный')
ok(nutritionAutoPlanId(C1, SUN) !== nutritionAutoPlanId(C1, '2026-10-25'), 'у каждого вс свой id')

const prefsOn = nutritionAutoPrefsFromSurvey({ nutritionAutoPush: true, nutritionAutoSkipDate: SUN })
ok(prefsOn.enabled && prefsOn.skipDate === SUN, 'prefs из survey')

const plan = {
  dayPlan: [
    {
      label: 'Завтрак',
      items: [{ productId: 'chicken_breast', label: 'Куриная грудка', grams: 100, kcal: 150, proteinG: 23, fatG: 1.5, carbsG: 0 }],
      kcalBudget: 400,
    },
  ],
  days: [],
  kcalTarget: 1800,
  totals: { kcal: 1800, proteinG: 100, fatG: 60, carbsG: 180 },
  basis: { weightKg: 70, heightCm: 170 },
  disclaimer: 'тест',
}
const health70 = { current_weight_kg: 70, height_cm: 170, sex: 'female' }
const health74 = { current_weight_kg: 74, height_cm: 170, sex: 'female' }

ok(nutritionAutoWeightDeltaKg(health74, plan) === 4, 'Δ веса 4 кг')
ok(!nutritionAutoNeedsRescale(health70, plan), 'тот же вес — не нужно')
ok(nutritionAutoNeedsRescale(health74, plan), '4 кг — нужно')

const client = { id: C1, trainer_id: TRAINER, club_id: U(3), archived_at: null }
ok(
  nutritionAutoHoldReason({
    enabled: true,
    client,
    health: health70,
    plan,
    sundayIso: SUN,
  }) === 'weight_ok',
  'hold: вес ок',
)
ok(
  nutritionAutoHoldReason({
    enabled: true,
    client,
    health: health74,
    plan,
    sundayIso: SUN,
  }) == null,
  '4 кг — без паузы',
)
ok(
  nutritionAutoHoldReason({
    enabled: true,
    skipDate: SUN,
    client,
    health: health74,
    plan,
    sundayIso: SUN,
  }) === 'skip',
  'hold: skip',
)
ok(
  nutritionAutoHoldReason({
    enabled: true,
    client: { ...client, archived_at: '2026-01-01' },
    health: health74,
    plan,
    sundayIso: SUN,
  }) === 'archived',
  'hold: archive',
)
ok(
  nutritionAutoHoldReason({
    enabled: true,
    client,
    health: health74,
    plan,
    sundayIso: SUN,
    lastManualDay: '2026-10-16',
  }) === 'manual',
  'hold: ручная отправка чт–вс',
)
ok(NUTRITION_AUTO_HOLD_RU.weight_ok.includes('3'), 'текст паузы про порог')

const catalogMap = buildNutritionCatalogMap([])
const built = buildNutritionAutoPlan({
  client,
  health: health74,
  survey: { nutritionAutoPush: true, goalKind: 'maintain', activityLevel: 'moderate', age: 30 },
  plan,
  catalogMap,
  sundayIso: SUN,
  now: new Date('2026-10-18T07:00:00Z'),
})
ok(built.ok, 'сборка авто-рациона')
if (built.ok) {
  ok(built.planRow.kind === 'nutrition' && built.planRow.id === nutritionAutoPlanId(C1, SUN), 'строка client_plans')
  ok(built.nextPlan.basis?.weightKg === 74, 'basis обновлён')
  const prep = normalizeClientPlanPushPayload(built.planRow)
  ok(prep.ok, 'payload проходит normalize')
}

const emptyResult = { data: [], error: null }
const emptyChain = {
  select() {
    return this
  },
  eq() {
    return this
  },
  not() {
    return this
  },
  gt() {
    return this
  },
  order() {
    return this
  },
  in() {
    return this
  },
  gte() {
    return this
  },
  limit() {
    return Promise.resolve(emptyResult)
  },
  then(resolve, reject) {
    return Promise.resolve(emptyResult).then(resolve, reject)
  },
  update() {
    return { eq: () => Promise.resolve({ error: null }) }
  },
  insert() {
    return Promise.resolve({ error: null })
  },
}
const skipped = await runNutritionAutoSend({
  db: { from: () => emptyChain },
  now: new Date('2026-10-15T12:00:00Z'),
})
ok(skipped.skipped === 'not_sunday_window', 'вне воскресенья — skip')

ok(nutritionAutoTrainerCardPath(C1) === `/trainer/clients/${C1}?tab=nutrition`, 'deep link тренеру')
const trainerPush = buildNutritionAutoTrainerPush({ clientName: 'Анна', deltaKg: 4, url: nutritionAutoTrainerCardPath(C1) })
ok(
  trainerPush.title === 'Рацион ушёл из‑за веса' &&
    trainerPush.body.includes('Анна') &&
    trainerPush.body.includes('4') &&
    trainerPush.url.includes('tab=nutrition'),
  'push тренеру: заголовок и тело',
)

if (failed) {
  console.error(`verify-nutrition-auto: ${failed} fail`)
  process.exit(1)
}
console.log('verify-nutrition-auto: ok')
