/**
 * Пороги числа тренировок за календарный месяц → уровень ставки ЗП тренера (1–3).
 * Ставки ₽ живут на типе карты; здесь только «с какой тренировки какой уровень».
 *
 * В JSON клуба: `workouts_l2_min` / `workouts_l3_min` (целые).
 * Старые ключи `hours_l2_min` / `hours_l3_min` читаются как совместимость.
 */

/** @typedef {{ workouts_l2_min: number, workouts_l3_min: number }} TrainerPayPlanConfig */

/** Дефолт клуба, пока админ не сохранил своё. */
export function defaultTrainerPayPlanConfig() {
  return { workouts_l2_min: 80, workouts_l3_min: 120 }
}

/**
 * Целое число тренировок ≥ 0 (дробь из старых данных округляется).
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parsePlanWorkouts(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

/** @deprecated используйте parsePlanWorkouts */
export const parsePlanHours = parsePlanWorkouts

function pickThreshold(src, workoutKey, hourKey) {
  if (src?.[workoutKey] != null && src[workoutKey] !== '') return src[workoutKey]
  if (src?.[hourKey] != null && src[hourKey] !== '') return src[hourKey]
  return undefined
}

/**
 * @param {unknown} raw
 * @returns {TrainerPayPlanConfig}
 */
export function normalizeTrainerPayPlanConfig(raw) {
  const base = defaultTrainerPayPlanConfig()
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const l2 = parsePlanWorkouts(pickThreshold(src, 'workouts_l2_min', 'hours_l2_min'))
  const l3 = parsePlanWorkouts(pickThreshold(src, 'workouts_l3_min', 'hours_l3_min'))
  return {
    workouts_l2_min: l2 == null ? base.workouts_l2_min : l2,
    workouts_l3_min: l3 == null ? base.workouts_l3_min : l3,
  }
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, config: TrainerPayPlanConfig } | { ok: false, error: string }}
 */
export function validateTrainerPayPlanConfigForSave(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const rawL2 = pickThreshold(src, 'workouts_l2_min', 'hours_l2_min')
  const rawL3 = pickThreshold(src, 'workouts_l3_min', 'hours_l3_min')
  const whole = (v) => /^\d+$/.test(String(v ?? '').trim())
  if (!whole(rawL2)) {
    return { ok: false, error: 'Тренировки для уровня 2: целое число ≥ 0' }
  }
  if (!whole(rawL3)) {
    return { ok: false, error: 'Тренировки для уровня 3: целое число ≥ 0' }
  }
  const l2 = parsePlanWorkouts(rawL2)
  const l3 = parsePlanWorkouts(rawL3)
  if (l2 == null || l3 == null) {
    return { ok: false, error: 'Укажите целые числа тренировок' }
  }
  if (l3 <= l2) {
    return { ok: false, error: 'Порог уровня 3 должен быть больше порога уровня 2' }
  }
  if (l3 > 9999 || l2 > 9999) {
    return { ok: false, error: 'Слишком много тренировок (макс. 9999)' }
  }
  return { ok: true, config: { workouts_l2_min: l2, workouts_l3_min: l3 } }
}

/**
 * Уровень ставки по числу тренировок месяца (календарный месяц — снаружи).
 * @param {unknown} workouts
 * @param {TrainerPayPlanConfig | null | undefined} config
 * @returns {1|2|3}
 */
export function resolveTrainerPayTierByWorkouts(workouts, config) {
  const cfg = normalizeTrainerPayPlanConfig(config)
  const n = parsePlanWorkouts(workouts)
  const value = n == null ? 0 : n
  if (value >= cfg.workouts_l3_min) return 3
  if (value >= cfg.workouts_l2_min) return 2
  return 1
}

/** @deprecated используйте resolveTrainerPayTierByWorkouts */
export const resolveTrainerPayTierByHours = resolveTrainerPayTierByWorkouts

/**
 * Текст полос для UI — целые интервалы без «.99».
 * Пример: пороги 101 и 141 → ур.1: 0–100, ур.2: 101–140, ур.3: от 141.
 * @param {TrainerPayPlanConfig | null | undefined} config
 * @returns {{ l1: string, l2: string, l3: string }}
 */
export function describeTrainerPayPlanBands(config) {
  const cfg = normalizeTrainerPayPlanConfig(config)
  const l2 = cfg.workouts_l2_min
  const l3 = cfg.workouts_l3_min
  const l1End = l2 - 1
  const l2End = l3 - 1
  return {
    l1: l2 <= 0 ? 'нет (уровень 2 с нуля)' : `от 0 до ${l1End} трен.`,
    l2: l2End < l2 ? `от ${l2} трен.` : `от ${l2} до ${l2End} трен.`,
    l3: `от ${l3} трен. и выше`,
  }
}
