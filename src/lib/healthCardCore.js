import { addDaysToIso } from './dateRu.js'
import { parseWeightKg, getHealthInitialWeightKg } from './clientWeightCore.js'
import {
  parseNutritionPlanHistory,
  serializeNutritionPlanHistoryForStorage,
} from './nutrition/nutritionPlanHistoryCore.js'

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
 * Дата составления: из формы при сохранении; иначе прежняя или сегодня.
 * @param {string | null | undefined} prevFilledAt
 * @param {string | null | undefined} formFilledAt
 * @param {string} todayIso
 */
export function resolveHealthFilledAtOnSave(prevFilledAt, formFilledAt, todayIso) {
  const form = parseHealthFilledAt(formFilledAt)
  if (form) return form
  const prev = parseHealthFilledAt(prevFilledAt)
  if (prev) return prev
  return todayIso
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
 * Дата исходного веса на графике: в начале шкалы (день до первой остальной точки),
 * не привязана к дате составления карты.
 * @param {{ entries?: object[], trainingDates?: string[], healthFilledAt?: string | null, todayIso?: string }} opts
 */
export function resolveBaselineWeightDate(opts = {}) {
  const { entries = [], trainingDates = [], healthFilledAt, todayIso = '1970-01-01' } = opts
  const dates = []
  for (const row of entries) {
    if (BASELINE_WEIGHT_SOURCES.includes(row?.source)) continue
    const d = parseHealthFilledAt(row?.date)
    if (d) dates.push(d)
  }
  for (const raw of trainingDates) {
    const d = parseHealthFilledAt(raw)
    if (d) dates.push(d)
  }
  const unique = [...new Set(dates)].sort()
  if (!unique.length) return parseHealthFilledAt(healthFilledAt) ?? todayIso
  return addDaysToIso(unique[0], -1)
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
  const rest = (entries ?? []).filter((r) => !BASELINE_WEIGHT_SOURCES.includes(r?.source))
  const trainingDates = rest.filter((r) => r?.source === 'training').map((r) => r.date)
  const baselineDate = resolveBaselineWeightDate({
    entries,
    trainingDates,
    healthFilledAt: filledAt,
  })

  const canonical =
    initial != null
      ? {
          ...(keeper ?? { id: 'canonical-baseline', source: 'baseline' }),
          id: keeperId ?? keeper?.id ?? 'canonical-baseline',
          date: baselineDate,
          weight_kg: initial,
          source: 'baseline',
        }
      : keeper

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
 * NOT NULL в Supabase: пустая история рационов — [].
 * @param {unknown} raw
 */
export function normalizeNutritionPlanHistoryForStorage(raw) {
  return serializeNutritionPlanHistoryForStorage(parseNutritionPlanHistory(raw))
}

/** Перед push в Supabase — не отправлять null в nutrition_plan_history. */
export function normalizeHealthCardPushPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  return {
    ...payload,
    nutrition_plan_history: normalizeNutritionPlanHistoryForStorage(payload.nutrition_plan_history),
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
        ? normalizeNutritionPlanHistoryForStorage(patch.nutrition_plan_history)
        : normalizeNutritionPlanHistoryForStorage(normalized.nutrition_plan_history),
  }
}
