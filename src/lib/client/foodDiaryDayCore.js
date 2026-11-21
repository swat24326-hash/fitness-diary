/**
 * Дневник калорий: день, приёмы, снимок КБЖУ в записи.
 * Каталог продуктов — отдельно; здесь ручной ввод и суммы.
 */
import { clubFoodDiaryEnabled } from './foodDiaryClubCore.js'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** База как FatSecret free + 2 доп. слота (Custom Meals light). */
export const FOOD_DIARY_MEALS = Object.freeze([
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' },
  { key: 'extra_1', label: 'Перекус 2' },
  { key: 'extra_2', label: 'Перекус 3' },
])

export const FOOD_DIARY_MEAL_KEYS = Object.freeze(FOOD_DIARY_MEALS.map((m) => m.key))

const MEAL_SET = new Set(FOOD_DIARY_MEAL_KEYS)

export function foodDiaryMealLabel(key) {
  return FOOD_DIARY_MEALS.find((m) => m.key === key)?.label ?? 'Приём'
}

export function isFoodDiaryMealKey(v) {
  return MEAL_SET.has(String(v ?? ''))
}

export function dayIso(v) {
  return String(v ?? '').slice(0, 10)
}

export function isIsoDate(v) {
  return ISO.test(dayIso(v))
}

/** Сдвиг даты YYYY-MM-DD на delta дней (локальная арифметика по UTC-дате). */
export function shiftIsoDate(iso, deltaDays) {
  const d = dayIso(iso)
  if (!isIsoDate(d)) return d
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + deltaDays * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function parseNum(raw, { min = 0, max = 1e6, allowZero = true } = {}) {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).trim().replace(',', '.'))
  if (!Number.isFinite(n)) return null
  if (!allowZero && n <= 0) return null
  if (n < min || n > max) return null
  return n
}

/**
 * Пересчёт с «на 100 г» → порция (КБЖУ + опц. клетчатка/сахар/натрий).
 * @param {object} per100
 * @param {number} grams
 */
export function scaleMacrosFromPer100(per100, grams) {
  const g = Number(grams)
  const k = g / 100
  const out = {
    kcal: round1(Number(per100.kcal) * k),
    protein_g: round1(Number(per100.protein_g) * k),
    fat_g: round1(Number(per100.fat_g) * k),
    carbs_g: round1(Number(per100.carbs_g) * k),
  }
  if (per100.fiber_g != null && per100.fiber_g !== '') {
    out.fiber_g = round1(Number(per100.fiber_g) * k)
  }
  if (per100.sugar_g != null && per100.sugar_g !== '') {
    out.sugar_g = round1(Number(per100.sugar_g) * k)
  }
  if (per100.sodium_mg != null && per100.sodium_mg !== '') {
    out.sodium_mg = round1(Number(per100.sodium_mg) * k)
  }
  return out
}

export function emptyFoodDiaryTotals() {
  return {
    kcal: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
    count: 0,
  }
}

/** Сумма дня по whitelist-полям. */
export function sumFoodDiaryDay(entries) {
  const out = emptyFoodDiaryTotals()
  for (const e of entries ?? []) {
    out.kcal = round1(out.kcal + (Number(e.kcal) || 0))
    out.protein_g = round1(out.protein_g + (Number(e.protein_g) || 0))
    out.fat_g = round1(out.fat_g + (Number(e.fat_g) || 0))
    out.carbs_g = round1(out.carbs_g + (Number(e.carbs_g) || 0))
    out.fiber_g = round1(out.fiber_g + (Number(e.fiber_g) || 0))
    out.sugar_g = round1(out.sugar_g + (Number(e.sugar_g) || 0))
    out.sodium_mg = round1(out.sodium_mg + (Number(e.sodium_mg) || 0))
    out.count += 1
  }
  return out
}

/** Записи по приёмам (порядок MEALS). */
export function groupFoodDiaryByMeal(entries) {
  const map = Object.fromEntries(FOOD_DIARY_MEAL_KEYS.map((k) => [k, []]))
  for (const e of entries ?? []) {
    const key = isFoodDiaryMealKey(e.meal_key) ? e.meal_key : 'snack'
    map[key].push(e)
  }
  return map
}

/** Слоты, в которых уже есть еда (порядок MEALS). */
export function foodDiaryOccupiedMealKeys(entries) {
  const seen = new Set()
  for (const e of entries ?? []) {
    const key = isFoodDiaryMealKey(e.meal_key) ? e.meal_key : 'snack'
    seen.add(key)
  }
  return FOOD_DIARY_MEAL_KEYS.filter((k) => seen.has(k))
}

/**
 * Какие приёмы показать на дне: с едой ∪ вручную открытые пустые.
 * Импорт из рациона → слоты появляются сами (через записи).
 */
export function foodDiaryVisibleMealKeys(entries, openKeys = []) {
  const open = new Set(
    (Array.isArray(openKeys) ? openKeys : []).filter((k) => isFoodDiaryMealKey(k)),
  )
  for (const k of foodDiaryOccupiedMealKeys(entries)) open.add(k)
  return FOOD_DIARY_MEAL_KEYS.filter((k) => open.has(k))
}

/** Свободные слоты, которые ещё можно добавить кнопкой. */
export function foodDiaryAddableMealKeys(visibleKeys = []) {
  const used = new Set((visibleKeys ?? []).filter((k) => isFoodDiaryMealKey(k)))
  return FOOD_DIARY_MEAL_KEYS.filter((k) => !used.has(k))
}

/** Следующий слот по порядку (завтрак → … → перекус 3). */
export function foodDiaryNextAddableMealKey(visibleKeys = []) {
  return foodDiaryAddableMealKeys(visibleKeys)[0] ?? null
}

/** Публичная строка для /me (без club_id / client_id). */
export function publicFoodDiaryEntry(row) {
  if (!row) return null
  return {
    id: String(row.id),
    entry_date: dayIso(row.entry_date),
    meal_key: String(row.meal_key),
    name: String(row.name ?? '').trim(),
    grams: row.grams == null ? null : Number(row.grams),
    kcal: Number(row.kcal) || 0,
    protein_g: Number(row.protein_g) || 0,
    fat_g: Number(row.fat_g) || 0,
    carbs_g: Number(row.carbs_g) || 0,
    fiber_g: Number(row.fiber_g) || 0,
    sugar_g: Number(row.sugar_g) || 0,
    sodium_mg: Number(row.sodium_mg) || 0,
  }
}

/** Опциональные нутриенты (клетчатка / сахар / натрий) — пусто = 0. */
function parseOptionalNutrients(src) {
  const fiberRaw = src?.fiber_g
  const sugarRaw = src?.sugar_g
  const sodiumRaw = src?.sodium_mg
  let fiber_g = 0
  let sugar_g = 0
  let sodium_mg = 0
  if (fiberRaw != null && fiberRaw !== '') {
    const n = parseNum(fiberRaw, { min: 0, max: 500 })
    if (n == null) return { ok: false, error: 'Проверьте клетчатку' }
    fiber_g = round1(n)
  }
  if (sugarRaw != null && sugarRaw !== '') {
    const n = parseNum(sugarRaw, { min: 0, max: 500 })
    if (n == null) return { ok: false, error: 'Проверьте сахар' }
    sugar_g = round1(n)
  }
  if (sodiumRaw != null && sodiumRaw !== '') {
    const n = parseNum(sodiumRaw, { min: 0, max: 20000 })
    if (n == null) return { ok: false, error: 'Проверьте натрий (мг)' }
    sodium_mg = round1(n)
  }
  return { ok: true, fiber_g, sugar_g, sodium_mg }
}

/**
 * @param {unknown} date
 * @param {string} today
 */
export function parseFoodDiaryDate(date, today) {
  const d = dayIso(date)
  if (!isIsoDate(d)) return { ok: false, error: 'Укажите дату' }
  if (!isIsoDate(today)) return { ok: false, error: 'Нет даты клуба' }
  if (d > today) return { ok: false, error: 'Дата не может быть в будущем' }
  return { ok: true, date: d }
}

/**
 * Разбор тела upsert. Можно передать готовые КБЖУ порции или per_100 + grams.
 * @param {object} body
 * @param {string} today
 */
export function parseFoodDiaryUpsert(body, today) {
  const dateParsed = parseFoodDiaryDate(body?.entry_date ?? body?.date, today)
  if (!dateParsed.ok) return dateParsed

  const meal_key = String(body?.meal_key ?? '').trim()
  if (!isFoodDiaryMealKey(meal_key)) {
    return { ok: false, error: 'Выберите приём пищи' }
  }

  const name = String(body?.name ?? '').trim()
  if (name.length < 1 || name.length > 120) {
    return { ok: false, error: 'Название: от 1 до 120 символов' }
  }

  const gramsRaw = body?.grams
  let grams = null
  if (gramsRaw != null && gramsRaw !== '') {
    grams = parseNum(gramsRaw, { min: 1, max: 5000, allowZero: false })
    if (grams == null) return { ok: false, error: 'Граммы: от 1 до 5000' }
    grams = round1(grams)
  }

  let macros
  const per100 = body?.per_100
  if (per100 && typeof per100 === 'object' && grams != null) {
    const kcal = parseNum(per100.kcal, { min: 0, max: 2000 })
    const protein_g = parseNum(per100.protein_g, { min: 0, max: 200 })
    const fat_g = parseNum(per100.fat_g, { min: 0, max: 200 })
    const carbs_g = parseNum(per100.carbs_g, { min: 0, max: 200 })
    if (kcal == null || protein_g == null || fat_g == null || carbs_g == null) {
      return { ok: false, error: 'Проверьте КБЖУ на 100 г' }
    }
    macros = scaleMacrosFromPer100(
      {
        kcal,
        protein_g,
        fat_g,
        carbs_g,
        fiber_g: per100.fiber_g,
        sugar_g: per100.sugar_g,
        sodium_mg: per100.sodium_mg,
      },
      grams,
    )
  } else {
    const kcal = parseNum(body?.kcal, { min: 0, max: 10000 })
    const protein_g = parseNum(body?.protein_g, { min: 0, max: 1000 })
    const fat_g = parseNum(body?.fat_g, { min: 0, max: 1000 })
    const carbs_g = parseNum(body?.carbs_g, { min: 0, max: 1000 })
    if (kcal == null || protein_g == null || fat_g == null || carbs_g == null) {
      return { ok: false, error: 'Укажите ккал и БЖУ порции' }
    }
    if (kcal === 0 && protein_g === 0 && fat_g === 0 && carbs_g === 0) {
      return { ok: false, error: 'КБЖУ не могут быть все нули' }
    }
    macros = {
      kcal: round1(kcal),
      protein_g: round1(protein_g),
      fat_g: round1(fat_g),
      carbs_g: round1(carbs_g),
    }
  }

  let extras
  if (macros.fiber_g != null || macros.sugar_g != null || macros.sodium_mg != null) {
    extras = {
      ok: true,
      fiber_g: macros.fiber_g ?? 0,
      sugar_g: macros.sugar_g ?? 0,
      sodium_mg: macros.sodium_mg ?? 0,
    }
  } else {
    extras = parseOptionalNutrients(body)
  }
  if (!extras.ok) return extras

  const id = String(body?.id ?? '').trim() || null
  return {
    ok: true,
    id,
    entry_date: dateParsed.date,
    meal_key,
    name,
    grams,
    kcal: macros.kcal,
    protein_g: macros.protein_g,
    fat_g: macros.fat_g,
    carbs_g: macros.carbs_g,
    fiber_g: extras.fiber_g,
    sugar_g: extras.sugar_g,
    sodium_mg: extras.sodium_mg,
  }
}

export function assertFoodDiaryClubEnabled(club) {
  return clubFoodDiaryEnabled(club)
}
