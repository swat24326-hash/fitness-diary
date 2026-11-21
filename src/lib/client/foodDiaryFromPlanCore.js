/**
 * Рацион тренера → строки дневника («В дневник»).
 * Чистый АЗ без рациона сюда не попадает (нет вкладки Рацион).
 */
import { clientNutritionDayView } from './clientNutritionDayCore.js'
import {
  FOOD_DIARY_MEAL_KEYS,
  foodDiaryMealLabel,
  isFoodDiaryMealKey,
  parseFoodDiaryDate,
} from './foodDiaryDayCore.js'

function round1(n) {
  return Math.round(Number(n) * 10) / 10
}

/**
 * Подпись приёма рациона → meal_key дневника.
 * index — запасной слот 0…5 (завтрак…перекус 3), без схлопывания 5-го в первый перекус.
 */
export function mealKeyFromPlanLabel(label, index = 0) {
  const l = String(label ?? '').toLowerCase()
  if (/втор(ой|ого)?\s*завтрак|завтрак\s*2|ланч/.test(l)) return 'extra_1'
  if (/завтрак/.test(l)) return 'breakfast'
  if (/обед/.test(l)) return 'lunch'
  if (/ужин/.test(l)) return 'dinner'
  if (/полдник|перекус\s*2|2.?перекус/.test(l)) return 'extra_1'
  if (/перекус\s*3|поздн|перед\s*сном|snack\s*2/.test(l)) return 'extra_2'
  if (/перекус|снек|snack/.test(l)) return 'snack'
  const i = Math.min(Math.max(0, Math.round(Number(index)) || 0), FOOD_DIARY_MEAL_KEYS.length - 1)
  return FOOD_DIARY_MEAL_KEYS[i]
}

/** Если слот уже занят — следующий свободный по кругу от preferred (перекус→перекус 2, не назад на завтрак). */
export function allocateFoodDiaryMealKey(preferredKey, usedKeys) {
  const used = usedKeys instanceof Set ? usedKeys : new Set(usedKeys ?? [])
  if (isFoodDiaryMealKey(preferredKey) && !used.has(preferredKey)) return preferredKey
  const start = Math.max(0, FOOD_DIARY_MEAL_KEYS.indexOf(String(preferredKey ?? '')))
  for (let i = 0; i < FOOD_DIARY_MEAL_KEYS.length; i++) {
    const k = FOOD_DIARY_MEAL_KEYS[(start + i) % FOOD_DIARY_MEAL_KEYS.length]
    if (!used.has(k)) return k
  }
  return FOOD_DIARY_MEAL_KEYS[FOOD_DIARY_MEAL_KEYS.length - 1]
}

/**
 * @param {object} planPayload — снимок client_plans nutrition
 * @param {number} dayIndex
 * @returns {object[]} черновики upsert (без id/client)
 */
export function foodDiaryRowsFromPlanDay(planPayload, dayIndex = 0) {
  const day = clientNutritionDayView(planPayload, dayIndex)
  const rows = []
  const meals = Array.isArray(day.meals) ? day.meals : []
  const used = new Set()
  meals.forEach((meal, mi) => {
    const preferred = mealKeyFromPlanLabel(meal?.label, mi)
    const meal_key = allocateFoodDiaryMealKey(preferred, used)
    used.add(meal_key)
    const items = Array.isArray(meal?.items) ? meal.items : []
    if (!items.length) {
      const sub = meal?.subtotal
      const kcal = Number(sub?.kcal ?? meal?.kcal) || 0
      if (kcal <= 0 && !String(meal?.label ?? '').trim()) return
      rows.push({
        meal_key,
        name: String(meal?.label ?? 'Приём').trim().slice(0, 120) || 'Приём',
        grams: null,
        kcal: round1(kcal),
        protein_g: round1(sub?.proteinG ?? sub?.protein_g ?? 0),
        fat_g: round1(sub?.fatG ?? sub?.fat_g ?? 0),
        carbs_g: round1(sub?.carbsG ?? sub?.carbs_g ?? 0),
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 0,
      })
      return
    }
    for (const it of items) {
      const name = String(it?.label ?? '').trim().slice(0, 120)
      if (!name) continue
      const kcal = Number(it.kcal) || 0
      const protein_g = Number(it.proteinG ?? it.protein_g) || 0
      const fat_g = Number(it.fatG ?? it.fat_g) || 0
      const carbs_g = Number(it.carbsG ?? it.carbs_g) || 0
      if (kcal === 0 && protein_g === 0 && fat_g === 0 && carbs_g === 0) continue
      const gramsRaw = Number(it.grams)
      rows.push({
        meal_key,
        name,
        grams: Number.isFinite(gramsRaw) && gramsRaw > 0 ? round1(gramsRaw) : null,
        kcal: round1(kcal),
        protein_g: round1(protein_g),
        fat_g: round1(fat_g),
        carbs_g: round1(carbs_g),
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 0,
      })
    }
  })
  return rows.filter((r) => isFoodDiaryMealKey(r.meal_key))
}

/** Нормализация списка приёмов из body; null = все приёмы дня. */
export function normalizeFoodDiaryFromPlanMealKeys(raw) {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  const keys = [...new Set(raw.map((k) => String(k ?? '')).filter(isFoodDiaryMealKey))]
  return keys
}

/**
 * Оставить только выбранные приёмы (обед да, ужин нет).
 * @param {object[]} rows
 * @param {string[]|null|undefined} mealKeys — null/пусто → без фильтра
 */
export function filterFoodDiaryRowsByMealKeys(rows, mealKeys) {
  if (!mealKeys || !mealKeys.length) return rows ?? []
  const set = new Set(mealKeys.filter(isFoodDiaryMealKey))
  if (!set.size) return []
  return (rows ?? []).filter((r) => set.has(r.meal_key))
}

/** Приёмы, которые реально есть в дне рациона (для чекбоксов UI). */
export function foodDiaryPlanMealOptions(planPayload, dayIndex = 0) {
  const rows = foodDiaryRowsFromPlanDay(planPayload, dayIndex)
  const keys = []
  for (const r of rows) {
    if (!keys.includes(r.meal_key)) keys.push(r.meal_key)
  }
  return keys.map((key) => ({ key, label: foodDiaryMealLabel(key) }))
}

/**
 * @param {'add'|'replace'} mode
 * @param {string[]} occupiedMealKeys — приёмы, где уже есть записи
 */
export function resolveFoodDiaryFromPlanConflict(mode, occupiedMealKeys, rows) {
  const occupied = new Set((occupiedMealKeys ?? []).filter(isFoodDiaryMealKey))
  if (mode === 'add' || occupied.size === 0) {
    return { ok: true, rows, delete_meal_keys: [] }
  }
  if (mode !== 'replace') {
    return { ok: false, error: 'Укажите: добавить или заменить' }
  }
  const touch = [...new Set(rows.map((r) => r.meal_key))].filter((k) => occupied.has(k))
  return { ok: true, rows, delete_meal_keys: touch }
}

/**
 * @param {object} body
 * @param {string} today
 */
export function parseFoodDiaryFromPlanRequest(body, today) {
  const dateParsed = parseFoodDiaryDate(body?.entry_date ?? body?.date ?? today, today)
  if (!dateParsed.ok) return dateParsed
  const mode = String(body?.mode ?? 'add')
  if (mode !== 'add' && mode !== 'replace') {
    return { ok: false, error: 'Режим: добавить или заменить' }
  }
  const dayIndex = Math.max(0, Math.round(Number(body?.day_index) || 0))
  const planPayload = body?.plan_payload
  if (!planPayload || typeof planPayload !== 'object') {
    return { ok: false, error: 'Нет рациона для копирования' }
  }
  let rows = foodDiaryRowsFromPlanDay(planPayload, dayIndex)
  if (!rows.length) return { ok: false, error: 'В рационе нет блюд на этот день' }
  const mealKeys = normalizeFoodDiaryFromPlanMealKeys(body?.meal_keys ?? body?.mealKeys)
  if (mealKeys) {
    if (!mealKeys.length) return { ok: false, error: 'Выберите хотя бы один приём' }
    rows = filterFoodDiaryRowsByMealKeys(rows, mealKeys)
    if (!rows.length) return { ok: false, error: 'В выбранных приёмах нет блюд' }
  }
  return {
    ok: true,
    entry_date: dateParsed.date,
    mode,
    day_index: dayIndex,
    meal_keys: mealKeys,
    rows,
  }
}
