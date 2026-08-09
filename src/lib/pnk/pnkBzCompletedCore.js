/**
 * Число завершённых бесплатных (БЗ) для итога визита ПНК.
 * Совпадает с карточкой тренера: count completed trainings, cap 2.
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
 * Как на карточке тренера: все completed у клиента (окно ПНК ≤ 2).
 * @param {object[] | null | undefined} trainings
 */
export function countPnkBzCompletedFromTrainings(trainings) {
  let n = 0
  for (const t of Array.isArray(trainings) ? trainings : []) {
    if (String(t?.status ?? '') === 'completed') n += 1
  }
  return normalizePnkBzCompletedCount(n)
}

/**
 * Карта client_id → 0…2 из строк тренировок (достаточно полей client_id, status).
 * @param {object[] | null | undefined} trainingRows
 * @returns {Record<string, number>}
 */
export function buildPnkBzCompletedByClientId(trainingRows) {
  /** @type {Record<string, number>} */
  const raw = {}
  for (const t of Array.isArray(trainingRows) ? trainingRows : []) {
    if (String(t?.status ?? '') !== 'completed') continue
    const id = String(t?.client_id ?? '').trim()
    if (!id) continue
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
