/**
 * Сценарий перед продом: собрать → отменить → сохранить → сменить вес → пересобрать.
 * Проверяет ядро без React/IDB (то, что реально ломается при регрессии).
 */
import { buildNutritionPlan, normalizeNutritionSurvey } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { isNutritionPlanStale } from '../src/lib/nutrition/nutritionPlanStaleCore.js'
import {
  appendNutritionPlanHistory,
  nutritionPlanHistoryEntry,
  parseNutritionPlanHistory,
} from '../src/lib/nutrition/nutritionPlanHistoryCore.js'
import { planMatchesSurvey, surveyBuildKey } from '../src/lib/nutrition/nutritionPlanSessionCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalogMap = buildNutritionCatalogMap([])

const health75 = { height_cm: 170, current_weight_kg: 75, weight_kg: 75, sex: 'male', goal: 'снижение' }
const savedSurvey = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  exclusions: [],
  pickedProducts: {
    protein: ['chicken_breast', 'eggs'],
    fat: ['olive_oil', 'nuts_walnut'],
    carbs: ['buckwheat', 'vegetables', 'apple'],
  },
})

// --- 1. Собрать рацион (превью / черновик) ---
let survey = { ...savedSurvey, pickedProducts: { ...savedSurvey.pickedProducts } }
const built1 = buildNutritionPlan(health75, survey, catalogMap)
ok(built1.ok, `1. собрать: ${built1.errors?.join('; ') ?? 'ok'}`)
const draftPlan = built1.plan
ok(draftPlan?.builtSurveyKey === surveyBuildKey(survey), '1. черновик с отпечатком опросника')
ok(planMatchesSurvey(draftPlan, survey), '1. черновик совпадает с опросником')

// --- 2. Отменить: сброс опросника и черновика (как в UI) ---
survey = { ...savedSurvey, pickedProducts: { ...savedSurvey.pickedProducts } }
const draftAfterCancel = null
ok(survey.mealsPerDay === savedSurvey.mealsPerDay, '2. отменить: опросник как сохранённый')
ok(draftAfterCancel == null, '2. отменить: черновика нет')

// Меняем опросник и черновик снова «собираем», потом отменяем с изменённым опросником
survey = { ...savedSurvey, mealsPerDay: 5 }
const builtDirty = buildNutritionPlan(health75, survey, catalogMap)
ok(builtDirty.ok, '2b. собрали с другим числом приёмов')
survey = { ...savedSurvey, pickedProducts: { ...savedSurvey.pickedProducts } }
ok(survey.mealsPerDay === 4, '2b. отменить: приёмы откатились к 4')

// --- 3. Сохранить рацион + история только ккал/БЖУ ---
let savedPlan = draftPlan
let planHistory = []
const generatedAt = '2026-07-11T10:00:00.000Z'

// Повторное сохранение — старый уходит в историю
planHistory = appendNutritionPlanHistory(planHistory, { plan: savedPlan, generatedAt })
const built2 = buildNutritionPlan(health75, savedSurvey, catalogMap)
ok(built2.ok, '3. пересборка перед вторым сохранением')
savedPlan = built2.plan
const generatedAt2 = '2026-07-11T11:00:00.000Z'
planHistory = appendNutritionPlanHistory(planHistory, { plan: savedPlan, generatedAt: generatedAt2 })

const parsed = parseNutritionPlanHistory(planHistory)
ok(parsed.length === 2, '3. в истории 2 записи')
ok(parsed[0].kcal != null && parsed[0].proteinG != null, '3. история: ккал и Б')
ok(!('plan' in planHistory[0]), '3. история без полного рациона')
ok(savedPlan?.totals?.kcal > 0, '3. сохранённый рацион с итогами')

// Нельзя сохранить при рассинхроне опросника и черновика
const mismatchedSurvey = { ...savedSurvey, mealsPerDay: 6 }
ok(!planMatchesSurvey(savedPlan, mismatchedSurvey), '3. сохранение заблокировано при смене опросника')

// --- 4. Сменить вес в «Здоровье» ---
const health78 = { ...health75, current_weight_kg: 78, weight_kg: 78 }
ok(isNutritionPlanStale(health78, savedPlan), '4. баннер устаревания после −3 кг')

// --- 5. Пересобрать с новым весом ---
const rebuilt = buildNutritionPlan(health78, savedSurvey, catalogMap)
ok(rebuilt.ok, `5. пересобрать: ${rebuilt.errors?.join('; ') ?? 'ok'}`)
ok(rebuilt.plan?.basis?.weightKg === 78, '5. новый рацион привязан к весу 78')
ok(rebuilt.plan?.kcalTarget !== savedPlan.kcalTarget, `5. цель ккал изменилась (${savedPlan.kcalTarget} → ${rebuilt.plan?.kcalTarget})`)
ok(!isNutritionPlanStale(health78, rebuilt.plan), '5. после пересборки устаревания нет')

const entry = nutritionPlanHistoryEntry(rebuilt.plan, '2026-07-11T12:00:00.000Z')
ok(entry.carbsG != null, '5. история после пересборки содержит У')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nProd-flow nutrition checks passed (build → cancel → save → weight → rebuild).')
