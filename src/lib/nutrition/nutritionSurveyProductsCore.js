/**
 * Пул продуктов для сборки рациона: «не ем» (по умолчанию) или старый выбор «ем только».
 */
import {
  filterCatalogProductsByExclusions,
  listCatalogProductsByGroup,
} from './nutritionCatalogResolve.js'

/**
 * Старый опросник «что ем» → «что не ем», чтобы экран совпадал со сборкой.
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function migratePickedSurveyToAvoid(survey, catalogMap) {
  if (resolveProductSelectMode(survey) !== 'pick') {
    if (survey?.productSelectMode === 'avoid' && Array.isArray(survey.avoidProductIds)) return survey
    return {
      ...survey,
      productSelectMode: 'avoid',
      avoidProductIds: survey?.avoidProductIds ?? [],
    }
  }
  const pp = survey.pickedProducts ?? {}
  const picked = new Set([...(pp.protein ?? []), ...(pp.fat ?? []), ...(pp.carbs ?? [])])
  /** @type {string[]} */
  const avoid = []
  for (const group of /** @type {const} */ (['protein', 'fat', 'carbs'])) {
    for (const p of listCatalogProductsByGroup(catalogMap, group)) {
      if (!picked.has(p.id)) avoid.push(p.id)
    }
  }
  return {
    ...survey,
    productSelectMode: 'avoid',
    avoidProductIds: avoid,
    pickedProducts: { protein: [], fat: [], carbs: [] },
  }
}

/**
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 * @returns {'avoid'|'pick'}
 */
export function resolveProductSelectMode(survey) {
  if (survey?.productSelectMode === 'avoid') return 'avoid'
  if (survey?.productSelectMode === 'pick') return 'pick'
  const pp = survey?.pickedProducts ?? {}
  const hasPicks =
    (pp.protein?.length ?? 0) > 0 || (pp.fat?.length ?? 0) > 0 || (pp.carbs?.length ?? 0) > 0
  // Старые опросники без режима: был выбор «что ем» → pick; пустой выбор → avoid (весь каталог).
  return hasPicks ? 'pick' : 'avoid'
}

/**
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @returns {{ protein: string[], fat: string[], carbs: string[] }}
 */
export function resolveSurveyProductPools(survey, catalogMap) {
  const exclusions = survey?.exclusions ?? []
  const mode = resolveProductSelectMode(survey)

  if (mode === 'pick') {
    const pp = survey?.pickedProducts ?? {}
    return {
      protein: filterCatalogProductsByExclusions(pp.protein ?? [], exclusions, catalogMap),
      fat: filterCatalogProductsByExclusions(pp.fat ?? [], exclusions, catalogMap),
      carbs: filterCatalogProductsByExclusions(pp.carbs ?? [], exclusions, catalogMap),
    }
  }

  const avoid = new Set((survey?.avoidProductIds ?? []).map(String))
  /** @param {'protein'|'fat'|'carbs'} group */
  const idsForGroup = (group) =>
    listCatalogProductsByGroup(catalogMap, group)
      .map((p) => p.id)
      .filter((id) => !avoid.has(id))

  return {
    protein: filterCatalogProductsByExclusions(idsForGroup('protein'), exclusions, catalogMap),
    fat: filterCatalogProductsByExclusions(idsForGroup('fat'), exclusions, catalogMap),
    carbs: filterCatalogProductsByExclusions(idsForGroup('carbs'), exclusions, catalogMap),
  }
}

/**
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @returns {string[]}
 */
export function validateSurveyProductPools(survey, catalogMap) {
  const pools = resolveSurveyProductPools(survey, catalogMap)
  const errors = []
  if (!pools.protein.length) errors.push('Не осталось белков — уберите часть из «Не ем» или ограничения')
  if (!pools.fat.length) errors.push('Не осталось жиров — уберите часть из «Не ем» или ограничения')
  if (!pools.carbs.length) errors.push('Не осталось углеводов — уберите часть из «Не ем» или ограничения')
  return errors
}
