import { parseWeightKg, getHealthInitialWeightKg } from './clientWeightCore.js'

/** @typedef {'male' | 'female'} HealthSex */

/**
 * @param {unknown} value
 * @returns {HealthSex | null}
 */
export function normalizeHealthSex(value) {
  if (value === 'male' || value === 'female') return value
  return null
}

/** @param {object | null | undefined} health */
export function getHealthSex(health) {
  return normalizeHealthSex(health?.sex)
}

/**
 * @param {unknown} value
 * @returns {string | null} YYYY-MM-DD
 */
export function parseHealthFilledAt(value) {
  if (value == null || value === '') return null
  const s = String(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** @param {object | null | undefined} health */
export function getHealthFilledAt(health) {
  return parseHealthFilledAt(health?.health_filled_at)
}

/**
 * Минимум для первой тренировки и расчёта питания.
 * @param {object | null | undefined} health
 */
export function isHealthCardComplete(health) {
  return getHealthCardCompletionIssues(health).length === 0
}

/**
 * @param {object | null | undefined} health
 * @returns {string[]}
 */
export function getHealthCardCompletionIssues(health) {
  const issues = []
  const h = Number(health?.height_cm)
  if (!Number.isFinite(h) || h <= 0) issues.push('Укажите рост в карте здоровья.')
  const initial = getHealthInitialWeightKg(health)
  if (initial == null) issues.push('Укажите исходный вес в карте здоровья.')
  if (!getHealthSex(health)) issues.push('Укажите пол в карте здоровья.')
  if (!getHealthFilledAt(health)) issues.push('Укажите дату составления карты здоровья.')
  return issues
}

/**
 * Дата составления: при первом заполнении — из формы или сегодня; иначе сохраняем существующую.
 * @param {string | null | undefined} prevFilledAt
 * @param {string | null | undefined} formFilledAt
 * @param {string} todayIso
 */
export function resolveHealthFilledAtOnSave(prevFilledAt, formFilledAt, todayIso) {
  const prev = parseHealthFilledAt(prevFilledAt)
  if (prev) return prev
  return parseHealthFilledAt(formFilledAt) ?? todayIso
}

/** Источники единственной базовой точки веса. */
export const BASELINE_WEIGHT_SOURCES = /** @type {const} */ (['baseline', 'initial_adjust'])

/**
 * @param {object[]} entries
 */
export function listBaselineLikeEntries(entries) {
  return [...(entries ?? [])].filter((r) => BASELINE_WEIGHT_SOURCES.includes(r?.source))
}

/**
 * @param {object[]} entries
 */
export function findBaselineWeightEntry(entries) {
  const rows = [...(entries ?? [])]
  const baseline = rows.find((r) => r?.source === 'baseline')
  if (baseline) return baseline
  const legacy = rows
    .filter((r) => r?.source === 'initial_adjust')
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
  return legacy[0] ?? null
}

/**
 * Одна строка исходного веса в UI: остальные baseline/initial_adjust скрываем.
 * @param {object[]} entries
 * @param {object | null | undefined} health
 */
export function filterWeightEntriesForDisplay(entries, health) {
  const baselineLike = listBaselineLikeEntries(entries)
  if (!baselineLike.length) return [...(entries ?? [])]

  const filledAt = getHealthFilledAt(health)
  const initial = getHealthInitialWeightKg(health)
  const keeper = findBaselineWeightEntry(entries)
  const keeperId = keeper?.id

  const canonical =
    filledAt && initial != null
      ? {
          ...(keeper ?? { id: 'canonical-baseline', source: 'baseline' }),
          id: keeperId ?? keeper?.id ?? 'canonical-baseline',
          date: filledAt,
          weight_kg: initial,
          source: 'baseline',
        }
      : keeper

  const rest = (entries ?? []).filter((r) => !BASELINE_WEIGHT_SOURCES.includes(r?.source))
  if (!canonical) return rest
  return [canonical, ...rest].sort((a, b) => {
    const d = String(b.date ?? '').localeCompare(String(a.date ?? ''))
    if (d !== 0) return d
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  })
}

/**
 * Точки для графика веса (по дате, одна точка на день — последняя запись).
 * @param {object[]} entries
 */
export function buildWeightChartSeries(entries) {
  const byDate = new Map()
  for (const row of [...(entries ?? [])].sort((a, b) => {
    const d = String(a.date ?? '').localeCompare(String(b.date ?? ''))
    if (d !== 0) return d
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })) {
    const date = parseHealthFilledAt(row.date)
    const w = parseWeightKg(row.weight_kg)
    if (!date || w == null) continue
    byDate.set(date, w)
  }
  const labels = [...byDate.keys()].sort()
  return {
    labels,
    values: labels.map((d) => byDate.get(d)),
  }
}

/**
 * Поля health_cards для сохранения (без id/client_id).
 * @param {object | null | undefined} health
 * @param {Record<string, unknown>} patch
 */
export function mergeHealthCardPersistRow(health, patch) {
  const normalized = health && typeof health === 'object' ? health : {}
  return {
    height_cm: patch.height_cm !== undefined ? patch.height_cm : (normalized.height_cm ?? null),
    sex: patch.sex !== undefined ? patch.sex : (normalized.sex ?? null),
    health_filled_at:
      patch.health_filled_at !== undefined ? patch.health_filled_at : (normalized.health_filled_at ?? null),
    goal: patch.goal !== undefined ? patch.goal : (normalized.goal ?? null),
    diseases: patch.diseases !== undefined ? patch.diseases : (normalized.diseases ?? null),
    contraindications:
      patch.contraindications !== undefined ? patch.contraindications : (normalized.contraindications ?? null),
    medications: patch.medications !== undefined ? patch.medications : (normalized.medications ?? null),
    notes: patch.notes !== undefined ? patch.notes : (normalized.notes ?? null),
    initial_weight_kg:
      patch.initial_weight_kg !== undefined ? patch.initial_weight_kg : (normalized.initial_weight_kg ?? null),
    current_weight_kg:
      patch.current_weight_kg !== undefined ? patch.current_weight_kg : (normalized.current_weight_kg ?? null),
    weight_kg: patch.weight_kg !== undefined ? patch.weight_kg : (normalized.weight_kg ?? null),
    weight_updated_at:
      patch.weight_updated_at !== undefined ? patch.weight_updated_at : (normalized.weight_updated_at ?? null),
    nutrition_survey:
      patch.nutrition_survey !== undefined ? patch.nutrition_survey : (normalized.nutrition_survey ?? null),
    nutrition_plan: patch.nutrition_plan !== undefined ? patch.nutrition_plan : (normalized.nutrition_plan ?? null),
    nutrition_plan_generated_at:
      patch.nutrition_plan_generated_at !== undefined
        ? patch.nutrition_plan_generated_at
        : (normalized.nutrition_plan_generated_at ?? null),
    nutrition_plan_history:
      patch.nutrition_plan_history !== undefined
        ? patch.nutrition_plan_history
        : (normalized.nutrition_plan_history ?? null),
  }
}
