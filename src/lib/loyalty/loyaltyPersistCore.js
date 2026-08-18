/**
 * Штамп лояльности на тренировке: старт сессии и first complete.
 * Без React / IDB. Живые max_minutes / max_kcal — из настроек клуба на complete.
 */

import { computeLoyaltyKcal } from './loyaltyKcalCore.js'
import { normalizeLoyaltySettings } from './loyaltySettingsCore.js'
import { isLoyaltyNoShowTraining } from './loyaltyTrainingEligibleCore.js'

/**
 * @typedef {object} LoyaltyTrainingStamp
 * @property {string} [session_started_at]
 * @property {string} [completed_at]
 * @property {number} [kcal]
 */

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeLoyaltyIso(raw) {
  if (raw == null || raw === '') return null
  const ms = Date.parse(String(raw))
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

/**
 * Первый штамп старта. Уже есть — тот же (pending→uuid не создаёт второй).
 * @param {unknown} existing
 * @param {unknown} nowIso
 * @returns {string | null}
 */
export function ensureLoyaltySessionStartedAt(existing, nowIso) {
  return normalizeLoyaltyIso(existing) || normalizeLoyaltyIso(nowIso)
}

/**
 * Потолок ккал на complete: живые настройки клуба, иначе дефолт 60 / 800.
 * @param {unknown} settingsRaw
 * @returns {{ maxMinutes: number, maxKcal: number }}
 */
export function resolveLoyaltyCompleteCaps(settingsRaw) {
  const s = normalizeLoyaltySettings(settingsRaw)
  return { maxMinutes: s.max_minutes, maxKcal: s.max_kcal_per_training }
}

function readExistingStamp(data) {
  const raw = data?.loyalty
  return raw && typeof raw === 'object' ? raw : {}
}

/**
 * Слить data.loyalty при persist черновика или first complete.
 * Неявка — без штампа. Повторное сохранение завершённой не пересчитывает ккал.
 * Ккал только из сэмплов HR, не из hr_session.kcal_est.
 *
 * @param {{
 *   data?: object,
 *   type?: string,
 *   firstCompletion?: boolean,
 *   nowIso?: string,
 *   samples?: Array<{ t?: number, bpm?: number }>,
 *   health?: { birthDate?: string, sex?: string, weightKg?: number, asOfIso?: string },
 *   settings?: unknown,
 * }} p
 * @returns {object}
 */
export function applyLoyaltyOnTrainingPersist(p = {}) {
  const src = p.data && typeof p.data === 'object' ? { ...p.data } : {}
  const type = p.type
  if (isLoyaltyNoShowTraining({ type, data: src })) {
    if (p.firstCompletion === true) delete src.loyalty
    return src
  }

  const existing = readExistingStamp(src)
  const nowIso = normalizeLoyaltyIso(p.nowIso)
  const sessionStartedAt = ensureLoyaltySessionStartedAt(existing.session_started_at, nowIso)

  if (p.firstCompletion !== true) {
    if (normalizeLoyaltyIso(existing.completed_at)) {
      src.loyalty = { ...existing }
      return src
    }
    if (sessionStartedAt) {
      src.loyalty = { session_started_at: sessionStartedAt }
    } else {
      delete src.loyalty
    }
    return src
  }

  const completedAt = nowIso
  let kcal = 0
  if (sessionStartedAt) {
    const caps = resolveLoyaltyCompleteCaps(p.settings)
    kcal = computeLoyaltyKcal({
      samples: p.samples,
      sessionStartedAt,
      health: p.health,
      maxMinutes: caps.maxMinutes,
      maxKcal: caps.maxKcal,
    })
  }

  src.loyalty = {
    session_started_at: sessionStartedAt || undefined,
    completed_at: completedAt || undefined,
    kcal: Number.isFinite(kcal) ? kcal : 0,
  }
  if (!src.loyalty.session_started_at) delete src.loyalty.session_started_at
  if (!src.loyalty.completed_at) delete src.loyalty.completed_at
  return src
}
