import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { NUTRITION_RECIPE_CATALOG } from '../src/lib/nutrition/nutritionRecipeCatalog.js'
import {
  buildMealForSlot,
  buildMealFromRecipe,
  listFittingRecipes,
  recipeFitsPool,
  resolveRecipeProductKey,
} from '../src/lib/nutrition/nutritionRecipesCore.js'
import { buildNutritionPlan, normalizeNutritionSurvey } from '../src/lib/nutrition/nutritionPlanBuilder.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalogMap = buildNutritionCatalogMap([])

ok(NUTRITION_RECIPE_CATALOG.length >= 18, `recipe catalog size (${NUTRITION_RECIPE_CATALOG.length})`)
ok(NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'oat_blini_savory_fish'), 'savory oat blini with fish')
ok(NUTRITION_RECIPE_CATALOG.some((r) => /Простоквашино|греческ/i.test(r.steps?.join(' ') ?? '')), 'dairy brands in steps')
const blenderNoise = NUTRITION_RECIPE_CATALOG.filter((r) =>
  /блендер здесь не нужен|блендер не нужен/i.test(r.steps?.join(' ') ?? ''),
)
ok(blenderNoise.length === 0, 'no useless «blender not needed» lines')
ok(
  NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'chicken_cottage_pate' && /блендер/i.test(r.steps?.join(' ') ?? '')),
  'blender only where useful (pate)',
)
const stoveish = NUTRITION_RECIPE_CATALOG.filter((r) =>
  /сковород|духовк|отвар|кипят|плит|миску|тарелк|смеша/i.test(r.steps?.join(' ') ?? ''),
)
ok(stoveish.length >= NUTRITION_RECIPE_CATALOG.length * 0.7, 'most recipes have clear how-to')
const airFirst = NUTRITION_RECIPE_CATALOG.filter((r) => {
  const t = r.steps?.join(' ') ?? ''
  const air = t.search(/аэрогриль/i)
  if (air < 0) return false
  const stove = t.search(/сковород|духовк|отвар|кипят/i)
  return stove < 0 || air < stove
})
ok(airFirst.length === 0, 'air fryer is not the primary path')
ok(NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'caesar_pp'), 'caesar_pp in catalog')
ok(
  !NUTRITION_RECIPE_CATALOG.some((r) => /авокадо|арахис/i.test(`${r.label} ${r.steps?.join(' ')}`)),
  'no avocado/peanut as recipe core',
)
ok(
  NUTRITION_RECIPE_CATALOG.every((r) =>
    (r.parts ?? []).every((p) => {
      if (p.productKey === 'avocado' || p.productKey === 'peanut_butter') return false
      if (p.productKey === 'salmon') return r.id === 'oat_blini_savory_fish'
      return true
    }),
  ),
  'salmon only in savory oat blini; no avocado/peanut_butter parts',
)
const toast = NUTRITION_RECIPE_CATALOG.find((r) => r.id === 'egg_bread_toast')
ok(/цельнозернов|ломтик|жир/i.test(toast?.steps?.join(' ') ?? ''), 'french toast: bread + fat warning')

const appleNuts = NUTRITION_RECIPE_CATALOG.find((r) => r.id === 'apple_nuts_snack')
ok(
  appleNuts?.parts?.some((p) => p.productKey === 'cottage_cheese_5'),
  'apple+nuts snack has cottage protein',
)
const kefirBanana = NUTRITION_RECIPE_CATALOG.find((r) => r.id === 'kefir_banana_snack')
ok(
  kefirBanana?.parts?.some((p) => p.productKey === 'cottage_cheese_5'),
  'kefir+banana snack has cottage protein',
)
ok(NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'turkey_meatballs_rice'), 'turkey meatballs lunch')
ok(NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'tuna_pasta_salad'), 'tuna pasta lunch')
ok(NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'lentil_chicken_stew'), 'lentil chicken stew')
ok(NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'chickpea_tuna_bowl'), 'chickpea tuna bowl')
ok(NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'millet_egg_veg'), 'dairy-free millet breakfast')
ok(NUTRITION_RECIPE_CATALOG.some((r) => r.id === 'tuna_toast_egg'), 'dairy-free tuna toast breakfast')
const dairyKeys = new Set([
  'cottage_cheese_5',
  'cottage_cheese_0',
  'yogurt',
  'yogurt_greek',
  'kefir',
  'cheese_light',
  'whey_protein',
  'protein_drink_hp',
  'butter',
])
for (const id of ['millet_egg_veg', 'tuna_toast_egg']) {
  const r = NUTRITION_RECIPE_CATALOG.find((x) => x.id === id)
  const dairyHit = (r?.parts ?? []).some((p) => dairyKeys.has(p.productKey))
  ok(!dairyHit, `${id} has no dairy parts`)
}
const endings = NUTRITION_RECIPE_CATALOG.map((r) => {
  const last = r.steps?.[r.steps.length - 1] ?? ''
  const m = last.match(/(Приятного аппетита\.|Готово — можно есть\.|На тарелку и к столу\.|Всё, можно есть\.|Приятного\.|Сытно и просто\.)\s*$/)
  return m?.[1] ?? ''
}).filter(Boolean)
const uniqueEndings = new Set(endings)
ok(uniqueEndings.size >= 4, `recipe endings vary (got ${uniqueEndings.size})`)
ok(
  !NUTRITION_RECIPE_CATALOG.some((r) => /80 ккал|очень калорийные|не полбуханки/i.test(r.steps?.join(' ') ?? '')),
  'no nanny kcal lectures in steps',
)
ok(
  /прогрейте до горячего пара/i.test(
    NUTRITION_RECIPE_CATALOG.find((r) => r.id === 'rice_egg_veg')?.steps?.join(' ') ?? '',
  ),
  'rice leftover safety note',
)

const fullPools = {
  protein: [
    'chicken_breast',
    'eggs',
    'cottage_cheese_5',
    'beef_lean',
    'yogurt',
    'kefir',
    'fish_white',
    'turkey_breast',
    'minced_turkey',
    'tuna_canned',
  ],
  fat: ['sunflower_oil', 'butter', 'nuts_walnut', 'olive_oil'],
  carbs: [
    'buckwheat',
    'rice',
    'potato',
    'pasta',
    'oats',
    'bread_whole',
    'vegetables',
    'apple',
    'banana',
    'berries',
    'millet',
    'lentils',
    'chickpeas',
  ],
}

ok(resolveRecipeProductKey('chicken_breast', fullPools, catalogMap) === 'chicken_breast', 'resolve builtin id')
ok(resolveRecipeProductKey('sunflower_oil', { ...fullPools, fat: ['olive_oil'] }, catalogMap) === 'olive_oil', 'sunflower falls back to olive')
ok(recipeFitsPool(NUTRITION_RECIPE_CATALOG.find((r) => r.id === 'caesar_pp'), fullPools, catalogMap), 'caesar fits full pool')

const caesar = buildMealFromRecipe({
  recipe: NUTRITION_RECIPE_CATALOG.find((r) => r.id === 'caesar_pp'),
  mealKcalBudget: 550,
  productIdsByGroup: fullPools,
  catalogMap,
})
ok(caesar?.source === 'recipe', 'caesar builds as recipe')
ok(caesar?.dishLabel?.includes('Цезарь'), `caesar label: ${caesar?.dishLabel}`)
ok((caesar?.recipeSteps?.length ?? 0) >= 3, 'caesar has steps')
ok(caesar?.items?.some((i) => i.productId === 'chicken_breast'), 'caesar has chicken')

const lunchFit = listFittingRecipes('lunch', fullPools, catalogMap)
ok(lunchFit.length >= 3, `lunch fitting recipes: ${lunchFit.length}`)

const meal0 = buildMealForSlot({
  slotId: 'lunch',
  mealIndex: 0,
  mealKcalBudget: 600,
  productIdsByGroup: fullPools,
  catalogMap,
  preferPrep: 'recipe',
})
const mealBasePlate = buildMealForSlot({
  slotId: 'lunch',
  mealIndex: 0,
  optionOffset: 99,
  mealKcalBudget: 600,
  productIdsByGroup: fullPools,
  catalogMap,
  preferPrep: 'base',
})
ok(meal0?.items?.length >= 2, 'slot meal 0 ok')
ok(meal0?.prep === 'recipe' || meal0?.source === 'recipe', `recipe prefer: ${meal0?.dishLabel}`)
ok(mealBasePlate?.prep === 'base' || mealBasePlate?.source === 'base', `base/plate option: ${mealBasePlate?.source}`)

const clubRows = [
  { id: 'u-ch', club_id: 'c1', label: 'Куриная грудка', macro_group: 'protein', protein_per100: 23, fat_per100: 2, carbs_per100: 0, tags: [], is_active: true },
  { id: 'u-yog', club_id: 'c1', label: 'Йогурт натуральный', macro_group: 'protein', protein_per100: 10, fat_per100: 2, carbs_per100: 4, tags: [], is_active: true },
  { id: 'u-veg', club_id: 'c1', label: 'Овощи (салат)', macro_group: 'carbs', protein_per100: 1.5, fat_per100: 0.2, carbs_per100: 5, tags: [], is_active: true },
  { id: 'u-oil', club_id: 'c1', label: 'Масло подсолнечное', macro_group: 'fat', protein_per100: 0, fat_per100: 100, carbs_per100: 0, tags: [], is_active: true },
  { id: 'u-buck', club_id: 'c1', label: 'Гречка (варёная)', macro_group: 'carbs', protein_per100: 4, fat_per100: 1, carbs_per100: 21, tags: [], is_active: true },
  { id: 'u-oats', club_id: 'c1', label: 'Овсянка (сухая)', macro_group: 'carbs', protein_per100: 13, fat_per100: 6, carbs_per100: 62, tags: [], is_active: true },
  { id: 'u-cot', club_id: 'c1', label: 'Творог 5%', macro_group: 'protein', protein_per100: 17, fat_per100: 5, carbs_per100: 2, tags: [], is_active: true },
  { id: 'u-ber', club_id: 'c1', label: 'Ягоды', macro_group: 'carbs', protein_per100: 0.7, fat_per100: 0.3, carbs_per100: 12, tags: [], is_active: true },
  { id: 'u-kef', club_id: 'c1', label: 'Кефир 1%', macro_group: 'protein', protein_per100: 3, fat_per100: 1, carbs_per100: 4, tags: [], is_active: true },
  { id: 'u-apple', club_id: 'c1', label: 'Яблоко', macro_group: 'carbs', protein_per100: 0.3, fat_per100: 0.2, carbs_per100: 14, tags: [], is_active: true },
]
const clubMap = buildNutritionCatalogMap(clubRows)
const clubPools = {
  protein: ['u-ch', 'u-yog', 'u-cot', 'u-kef'],
  fat: ['u-oil'],
  carbs: ['u-veg', 'u-buck', 'u-oats', 'u-ber', 'u-apple'],
}
ok(resolveRecipeProductKey('chicken_breast', clubPools, clubMap) === 'u-ch', 'resolve club by label')
ok(resolveRecipeProductKey('sunflower_oil', clubPools, clubMap) === 'u-oil', 'resolve sunflower by label')
const caesarClub = buildMealFromRecipe({
  recipe: NUTRITION_RECIPE_CATALOG.find((r) => r.id === 'caesar_pp'),
  mealKcalBudget: 500,
  productIdsByGroup: clubPools,
  catalogMap: clubMap,
})
ok(caesarClub?.source === 'recipe', `caesar on club UUID: ${caesarClub?.dishLabel ?? caesarClub}`)

const health = { height_cm: 170, current_weight_kg: 75, weight_kg: 75, sex: 'male' }
const survey = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  exclusions: [],
  pickedProducts: fullPools,
})
const built = buildNutritionPlan(health, survey, catalogMap)
ok(built.ok, `full plan with recipes: ${built.errors?.join('; ') ?? ''}`)
ok(built.plan?.version === 5, 'plan v5')
const recipeMeals = (built.plan?.dayPlan ?? []).filter((m) => m.prep === 'recipe' || m.source === 'recipe')
const baseMeals = (built.plan?.dayPlan ?? []).filter((m) => m.prep === 'base' || m.source === 'base')
ok(recipeMeals.length === 2, `exactly 2 recipes in 4-meal day (got ${recipeMeals.length})`)
ok(baseMeals.length === 2, `exactly 2 base meals (got ${baseMeals.length})`)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition recipe checks passed')
