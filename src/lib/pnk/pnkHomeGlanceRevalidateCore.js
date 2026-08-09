/**
 * Политика сети для glance ПНК на главной (×10 клубов, активная админка).
 * Правда: last-good + фоновая перепроверка, но не чаще minMs без force.
 */

export const PNK_HOME_GLANCE_REVALIDATE_MIN_MS = 25_000

export const PNK_HOME_GLANCE_CHANGED_EVENT = 'fd-pnk-home-glance-changed'

/**
 * Нужен ли сетевой refetch.
 * @param {{
 *   savedAt?: number | null,
 *   now?: number,
 *   force?: boolean,
 *   minMs?: number,
 *   hasCachedCards?: boolean,
 * }} [opts]
 */
export function shouldNetworkRevalidatePnkHomeGlance(opts = {}) {
  if (opts.force === true) return true
  const now = typeof opts.now === 'number' ? opts.now : Date.now()
  const minMs =
    Number(opts.minMs) > 0 ? Number(opts.minMs) : PNK_HOME_GLANCE_REVALIDATE_MIN_MS
  const savedAt = opts.savedAt
  const hasCached = opts.hasCachedCards === true
  // Холодный старт без кэша — всегда сеть
  if (!hasCached && (typeof savedAt !== 'number' || !Number.isFinite(savedAt))) return true
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return true
  return now - savedAt >= minMs
}

/**
 * @param {string} clubId
 * @param {{ source?: string }} [detail]
 */
export function notifyPnkHomeGlanceChanged(clubId, detail = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid || typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(
      new CustomEvent(PNK_HOME_GLANCE_CHANGED_EVENT, {
        detail: { clubId: cid, source: detail.source || 'sync', at: Date.now() },
      }),
    )
  } catch {
    /* ignore */
  }
}
