/**
 * TTL облачного прайса (чистые функции). Прайс меняется редко — долгий кэш ок.
 */

/** 7 суток до обязательного soft-refresh из облака. */
export const PRICE_LIST_CLOUD_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * @param {unknown} fetchedAt
 * @param {number} [nowMs]
 * @param {number} [ttlMs]
 */
export function isPriceListCloudFresh(fetchedAt, nowMs = Date.now(), ttlMs = PRICE_LIST_CLOUD_TTL_MS) {
  const at = Number(fetchedAt)
  const ttl = Math.max(0, Number(ttlMs) || 0)
  if (!Number.isFinite(at) || at <= 0) return false
  return nowMs - at < ttl
}

/**
 * Конверт localStorage: документ + время успешной облачной загрузки/сохранения.
 * @param {object} doc
 * @param {number | null | undefined} fetchedAt
 */
export function wrapPriceListLocalCache(doc, fetchedAt) {
  const at = Number(fetchedAt)
  return {
    v: 1,
    fetchedAt: Number.isFinite(at) && at > 0 ? at : 0,
    doc: doc ?? null,
  }
}

/**
 * Разбор сырого JSON из localStorage (новый конверт или старый «голый» doc).
 * @param {unknown} parsed
 * @returns {{ doc: object | null, fetchedAt: number }}
 */
export function parsePriceListLocalCache(parsed) {
  if (!parsed || typeof parsed !== 'object') return { doc: null, fetchedAt: 0 }
  if (parsed.v === 1 && parsed.doc && typeof parsed.doc === 'object') {
    const at = Number(parsed.fetchedAt)
    return {
      doc: parsed.doc,
      fetchedAt: Number.isFinite(at) && at > 0 ? at : 0,
    }
  }
  // Старый формат: сам документ прайса
  if (Array.isArray(parsed.tariffs) || parsed.club_id != null || parsed.cells != null) {
    return { doc: parsed, fetchedAt: 0 }
  }
  return { doc: null, fetchedAt: 0 }
}
