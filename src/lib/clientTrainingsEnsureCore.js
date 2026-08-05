/**
 * Когда подтягивать полный дневник клиента с сервера в IndexedDB.
 * Нельзя останавливаться на «локально уже есть 1 строка» — часто это хвост месяца из журнала,
 * а июль/прошлый абон остаются только в облаке.
 */

/**
 * @param {{
 *   online?: boolean,
 *   force?: boolean,
 *   lastEnsureAtMs?: number | null,
 *   nowMs?: number,
 *   ttlMs?: number,
 * }} p
 * @returns {boolean}
 */
export function shouldRefreshClientTrainingsFromCloud(p) {
  if (p?.force === true) return true
  if (!p?.online) return false
  const ttl = Number(p?.ttlMs)
  const last = p?.lastEnsureAtMs
  const now = Number(p?.nowMs) || 0
  if (
    Number.isFinite(ttl) &&
    ttl > 0 &&
    last != null &&
    Number.isFinite(Number(last)) &&
    now - Number(last) < ttl
  ) {
    return false
  }
  return true
}

/** Повторный hydrate того же клиента не чаще чем раз в TTL (вкладки Тренировки+Абонементы). */
export const CLIENT_TRAININGS_ENSURE_TTL_MS = 90_000
