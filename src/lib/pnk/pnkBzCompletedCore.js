/**
 * Число завершённых бесплатных (БЗ) для итога визита ПНК.
 * Совпадает с карточкой тренера: count completed trainings, cap 2.
 * Опционально — только с даты входа в ПНК (не копить старый дневник).
 * Без React / IDB.
 */

export const PNK_BZ_COMPLETED_CAP = 2

/**
 * @param {unknown} raw
 * @returns {number} 0…PNK_BZ_COMPLETED_CAP
 */
export function normalizePnkBzCompletedCount(raw) {
  const n = Math.max(0, Math.floor(Number(raw) || 0))
  return Math.min(PNK_BZ_COMPLETED_CAP, n)
}

/**
 * Дата тренировки для окна ПНК.
 * @param {object | null | undefined} t
 */
export function pnkTrainingDayIso(t) {
  const raw = String(t?.date ?? t?.training_date ?? t?.completed_at ?? t?.updated_at ?? t?.created_at ?? '')
  const day = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
}

/**
 * Как на карточке тренера: completed у клиента (окно ПНК ≤ 2).
 * @param {object[] | null | undefined} trainings
 * @param {{ sinceIso?: string | null }} [opts] — не считать тренировки раньше входа в ПНК
 */
export function countPnkBzCompletedFromTrainings(trainings, opts = {}) {
  const since = String(opts.sinceIso ?? '').slice(0, 10)
  const sinceOk = /^\d{4}-\d{2}-\d{2}$/.test(since)
  let n = 0
  for (const t of Array.isArray(trainings) ? trainings : []) {
    if (String(t?.status ?? '') !== 'completed') continue
    if (sinceOk) {
      const day = pnkTrainingDayIso(t)
      if (day && day < since) continue
    }
    n += 1
  }
  return normalizePnkBzCompletedCount(n)
}

/**
 * Карта client_id → 0…2 из строк тренировок.
 * @param {object[] | null | undefined} trainingRows
 * @param {{ sinceByClientId?: Record<string, string | null | undefined> | null }} [opts]
 * @returns {Record<string, number>}
 */
export function buildPnkBzCompletedByClientId(trainingRows, opts = {}) {
  const sinceByClient = opts.sinceByClientId ?? null
  /** @type {Record<string, number>} */
  const raw = {}
  for (const t of Array.isArray(trainingRows) ? trainingRows : []) {
    if (String(t?.status ?? '') !== 'completed') continue
    const id = String(t?.client_id ?? '').trim()
    if (!id) continue
    const since = String(sinceByClient?.[id] ?? '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
      const day = pnkTrainingDayIso(t)
      if (day && day < since) continue
    }
    raw[id] = (raw[id] || 0) + 1
  }
  /** @type {Record<string, number>} */
  const out = {}
  for (const [id, n] of Object.entries(raw)) {
    out[id] = normalizePnkBzCompletedCount(n)
  }
  return out
}

/**
 * @param {Record<string, number> | null | undefined} byClient
 * @param {string | null | undefined} clientId
 */
export function peekPnkBzCompletedCount(byClient, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id || !byClient || typeof byClient !== 'object') return 0
  return normalizePnkBzCompletedCount(byClient[id])
}
