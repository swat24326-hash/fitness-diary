/**
 * Добор ккал/белка после clamp порций — нейронка «забывает» цель, мы нет.
 * Добор только из разрешённого пула («Не ем»), без чужих builtin-id и без масла вместо белка.
 */
import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import { formatProductPortion, macrosForGrams } from './nutritionMacrosCore.js'
import { clampProductGrams, getProductMealRole } from './nutritionMealPairingCore.js'
import { getNutritionProductById } from './nutritionProductCatalog.js'

/** Если порции упёрлись в потолок — докидываем гарнир/орехи/масло из пула клиента. */
const KCAL_FILLER_KEYS = [
  'rice',
  'buckwheat',
  'pasta_whole',
  'potato',
  'oats',
  'banana',
  'nuts_walnut',
  'sunflower_oil',
  'olive_oil',
]

/** Когда не хватает белка — докидываем белок из пула, не крупу. */
const PROTEIN_FILLER_KEYS = [
  'chicken_breast',
  'turkey_breast',
  'minced_turkey',
  'beef_lean',
  'eggs',
  'cottage_cheese_5',
  'cottage_cheese_0',
  'yogurt_greek',
  'protein_drink_hp',
  'tuna_canned',
  'fish_white',
  'pollock',
]

function normalizeLabel(label) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function sumItems(items) {
  return items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + (it.kcal ?? 0),
      proteinG: Math.round((acc.proteinG + (it.proteinG ?? 0)) * 10) / 10,
      fatG: Math.round((acc.fatG + (it.fatG ?? 0)) * 10) / 10,
      carbsG: Math.round((acc.carbsG + (it.carbsG ?? 0)) * 10) / 10,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  )
}

function finalizeItem(item, catalogMap) {
  const p = resolveCatalogProduct(catalogMap, item.productId, { label: item.label })
  if (!p) return item
  const grams = clampProductGrams(item.productId, item.grams ?? 0, p)
  const portion = formatProductPortion(p, grams)
  const m = macrosForGrams(p, portion.grams)
  return {
    productId: item.productId,
    label: item.label ?? p.label,
    grams: portion.grams,
    portionLabel: portion.display,
    ...m,
  }
}

function topUpPriority(productId, product) {
  const role = getProductMealRole(productId, product)
  if (role === 'protein') return 3
  if (role === 'starchy' || role === 'grain' || role === 'fruit') return 2
  if (role === 'oil_fat' || role === 'nut_fat' || role === 'spread_dairy_fat') return 1
  return 0
}

/**
 * Ключ справочника → id из разрешённого пула (или из карты клуба по названию).
 * @param {string} builtinKey
 * @param {Map} catalogMap
 * @param {Set<string> | null} allowed
 */
function resolveFillerId(builtinKey, catalogMap, allowed) {
  const key = String(builtinKey ?? '').trim()
  if (!key) return null
  if ((!allowed || allowed.has(key)) && resolveCatalogProduct(catalogMap, key)) {
    return !allowed || allowed.has(key) ? key : null
  }
  const builtin = getNutritionProductById(key)
  const want = normalizeLabel(builtin?.label)
  if (!want) return null
  const candidates = allowed?.size ? allowed : catalogMap.keys()
  for (const id of candidates) {
    const p = resolveCatalogProduct(catalogMap, id)
    if (p && normalizeLabel(p.label) === want) {
      if (!allowed || allowed.has(id)) return id
    }
  }
  return null
}

/**
 * @param {object[]} items
 * @param {number} mealKcalBudget
 * @param {Map} catalogMap
 * @param {{ preferProtein?: boolean, allowedIds?: string[] | Set<string> | null }} [opts]
 */
export function topUpMealItemsToBudget(items, mealKcalBudget, catalogMap, opts = {}) {
  if (!items?.length || !(mealKcalBudget > 0)) return items ?? []
  let next = items.map((it) => finalizeItem(it, catalogMap))
  const preferProtein = opts.preferProtein === true
  const allowed =
    opts.allowedIds == null
      ? null
      : opts.allowedIds instanceof Set
        ? opts.allowedIds
        : new Set([...opts.allowedIds].map(String))
  const step = 10
  const maxRounds = 50

  for (let round = 0; round < maxRounds; round++) {
    const sub = sumItems(next)
    if (sub.kcal >= mealKcalBudget * 0.95) break

    let ranked = next
      .map((it, index) => {
        const p = resolveCatalogProduct(catalogMap, it.productId, { label: it.label })
        const capped = clampProductGrams(it.productId, (it.grams ?? 0) + step, p)
        const room = capped - (it.grams ?? 0)
        let pri = topUpPriority(it.productId, p)
        const role = getProductMealRole(it.productId, p)
        if (preferProtein && role === 'protein') pri += 3
        else if (!preferProtein && role === 'protein') pri -= 1
        return { index, room, pri, role }
      })
      .filter((x) => x.room > 0)
      .sort((a, b) => b.pri - a.pri || b.room - a.room)

    if (preferProtein) {
      const onlyProtein = ranked.filter((x) => x.role === 'protein')
      if (onlyProtein.length) ranked = onlyProtein
      else {
        const withProtein = tryAppendFiller(next, catalogMap, allowed, PROTEIN_FILLER_KEYS)
        if (!withProtein) break
        next = withProtein
        continue
      }
    }

    if (!ranked.length) {
      const keys = preferProtein ? PROTEIN_FILLER_KEYS : KCAL_FILLER_KEYS
      const withFiller = tryAppendFiller(next, catalogMap, allowed, keys)
      if (!withFiller) break
      next = withFiller
      continue
    }
    const pick = ranked[0]
    const it = next[pick.index]
    next[pick.index] = finalizeItem({ ...it, grams: (it.grams ?? 0) + Math.min(step, pick.room) }, catalogMap)
  }
  return next
}

/**
 * @param {object[]} items
 * @param {Map} catalogMap
 * @param {Set<string> | null} allowed
 * @param {string[]} fillerKeys
 * @returns {object[] | null}
 */
function tryAppendFiller(items, catalogMap, allowed, fillerKeys) {
  const have = new Set(items.map((i) => i.productId))
  const existingRoles = items.map((i) =>
    getProductMealRole(i.productId, resolveCatalogProduct(catalogMap, i.productId, { label: i.label })),
  )
  const hasCarbSide = existingRoles.some((r) => r === 'starchy' || r === 'grain')
  for (const key of fillerKeys) {
    const id = resolveFillerId(key, catalogMap, allowed)
    if (!id || have.has(id)) continue
    const p = resolveCatalogProduct(catalogMap, id)
    if (!p) continue
    if (allowed && !allowed.has(id)) continue
    const role = getProductMealRole(id, p)
    // Не класть второй гарнир (макароны + рис) — тарелка и название расходятся с реальностью.
    if (hasCarbSide && (role === 'starchy' || role === 'grain')) continue
    if (role === 'oil_fat' || role === 'spread_dairy_fat') {
      if (!existingRoles.some((r) => r === 'starchy' || r === 'grain' || r === 'protein' || r === 'salad')) continue
    }
    const startG = role === 'oil_fat' || role === 'nut_fat' ? 10 : role === 'protein' ? 80 : 80
    const grams = clampProductGrams(id, startG, p)
    if (!(grams > 0)) continue
    return [...items, finalizeItem({ productId: id, label: p.label, grams }, catalogMap)]
  }
  return null
}

/**
 * @param {object[]} dayPlan
 * @param {{ kcalTarget: number, proteinAim?: number }} targets
 * @param {Map} catalogMap
 * @param {{ allowedIds?: string[] | Set<string> | null }} [opts]
 */
export function topUpDayPlanTowardTargets(dayPlan, targets, catalogMap, opts = {}) {
  if (!dayPlan?.length) return dayPlan ?? []
  const kcalTarget = Number(targets?.kcalTarget) || 0
  const proteinAim = Number(targets?.proteinAim) || 0
  const allowedIds = opts.allowedIds ?? null
  const mealOpts = { allowedIds }

  // Сначала ккал (крупы/гарнир), белок — отдельным проходом, если недобор.
  let next = dayPlan.map((meal) => {
    const items = topUpMealItemsToBudget(meal.items ?? [], Number(meal.kcalBudget) || 0, catalogMap, {
      ...mealOpts,
      preferProtein: false,
    })
    return { ...meal, items, subtotal: sumItems(items) }
  })

  let totals = sumItems(next.flatMap((m) => m.items))

  if (kcalTarget > 0 && totals.kcal < kcalTarget * 0.92) {
    for (let pass = 0; pass < 4 && totals.kcal < kcalTarget * 0.92; pass++) {
      const factor = 1.1 + pass * 0.1
      next = next.map((meal) => {
        const budget = Math.round((Number(meal.kcalBudget) || 0) * factor)
        const items = topUpMealItemsToBudget(meal.items ?? [], budget, catalogMap, {
          ...mealOpts,
          preferProtein: false,
        })
        return { ...meal, items, subtotal: sumItems(items) }
      })
      totals = sumItems(next.flatMap((m) => m.items))
    }
  }

  if (proteinAim > 0 && totals.proteinG < proteinAim * 0.9) {
    next = next.map((meal) => {
      const items = topUpMealItemsToBudget(meal.items ?? [], (Number(meal.kcalBudget) || 0) * 1.2, catalogMap, {
        ...mealOpts,
        preferProtein: true,
      })
      return { ...meal, items, subtotal: sumItems(items) }
    })
  }

  return next
}

export { sumItems as sumMealItemsForTopUp }
