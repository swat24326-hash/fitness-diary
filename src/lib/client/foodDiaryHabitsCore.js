/**
 * «Часто ем» и копирование дня/приёма.
 */
import { dayIso, isFoodDiaryMealKey, isIsoDate, publicFoodDiaryEntry } from './foodDiaryDayCore.js'

/**
 * Топ продуктов по имени из истории записей.
 * @param {object[]} entries
 * @param {{ limit?: number }} [opts]
 */
export function buildFrequentFoods(entries, opts = {}) {
  const limit = Math.min(20, Math.max(1, Number(opts.limit) || 8))
  /** @type {Map<string, { name: string, count: number, last: object }>} */
  const map = new Map()
  for (const e of entries ?? []) {
    const name = String(e?.name ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const prev = map.get(key)
    if (!prev) map.set(key, { name, count: 1, last: e })
    else {
      prev.count += 1
      prev.last = e
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit)
    .map((x) => ({
      name: x.name,
      count: x.count,
      grams: x.last.grams ?? null,
      kcal: Number(x.last.kcal) || 0,
      protein_g: Number(x.last.protein_g) || 0,
      fat_g: Number(x.last.fat_g) || 0,
      carbs_g: Number(x.last.carbs_g) || 0,
      fiber_g: Number(x.last.fiber_g) || 0,
      sugar_g: Number(x.last.sugar_g) || 0,
      sodium_mg: Number(x.last.sodium_mg) || 0,
    }))
}

/**
 * Подготовить копии строк на новую дату (без id).
 * @param {object[]} sourceEntries
 * @param {string} toDate
 * @param {{ meal_key?: string|null }} [opts] — только один приём, если задан
 */
export function buildCopiedFoodDiaryRows(sourceEntries, toDate, opts = {}) {
  const to = dayIso(toDate)
  if (!isIsoDate(to)) return { ok: false, error: 'Укажите дату назначения' }
  const mealFilter = opts.meal_key ? String(opts.meal_key) : null
  if (mealFilter && !isFoodDiaryMealKey(mealFilter)) {
    return { ok: false, error: 'Неверный приём пищи' }
  }
  const rows = []
  for (const e of sourceEntries ?? []) {
    if (mealFilter && e.meal_key !== mealFilter) continue
    const pub = publicFoodDiaryEntry({ ...e, entry_date: to, id: 'x' })
    if (!pub) continue
    rows.push({
      entry_date: to,
      meal_key: pub.meal_key,
      name: pub.name,
      grams: pub.grams,
      kcal: pub.kcal,
      protein_g: pub.protein_g,
      fat_g: pub.fat_g,
      carbs_g: pub.carbs_g,
      fiber_g: pub.fiber_g,
      sugar_g: pub.sugar_g,
      sodium_mg: pub.sodium_mg,
    })
  }
  if (!rows.length) return { ok: false, error: 'Нечего копировать' }
  return { ok: true, rows }
}

/**
 * @param {string} fromDate
 * @param {string} toDate
 * @param {string} today
 */
export function parseFoodDiaryCopyDates(fromDate, toDate, today) {
  const from = dayIso(fromDate)
  const to = dayIso(toDate)
  if (!isIsoDate(from) || !isIsoDate(to)) return { ok: false, error: 'Укажите даты' }
  if (!isIsoDate(today)) return { ok: false, error: 'Нет даты клуба' }
  if (to > today) return { ok: false, error: 'Дата назначения не может быть в будущем' }
  if (from === to) return { ok: false, error: 'Выберите другой день' }
  return { ok: true, from, to }
}
