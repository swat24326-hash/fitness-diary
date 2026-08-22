/**
 * Glance ПНК на главной админа/менеджера — last-good + сеть с debounce (×10 клубов).
 */
import { createGlanceCache } from '../homeGlanceCache.js'
import { buildPnkManagerHomeGlanceCards } from './pnkManagerHomeGlanceCore.js'
import { notifyPnkHomeGlanceChanged } from './pnkHomeGlanceRevalidateCore.js'

const cache = createGlanceCache({
  ns: 'admin-pnk-home',
  ttlMs: 10 * 60 * 1000,
})

export const PNK_HOME_GLANCE_TTL_MS = cache.ttlMs

export {
  PNK_HOME_GLANCE_CHANGED_EVENT,
  PNK_HOME_GLANCE_REVALIDATE_MIN_MS,
  shouldNetworkRevalidatePnkHomeGlance,
  notifyPnkHomeGlanceChanged,
} from './pnkHomeGlanceRevalidateCore.js'

function parts(clubId) {
  return [String(clubId ?? '').trim()]
}

/** @returns {{ payload: { cards: object[] }, savedAt: number } | null} */
export function readPnkHomeGlanceSession(clubId) {
  return cache.read(parts(clubId))
}

/** @returns {object[]|null} */
export function peekPnkHomeGlanceCards(clubId) {
  const payload = cache.peek(parts(clubId))
  const cards = payload?.cards
  return Array.isArray(cards) && cards.length ? cards : null
}

export function writePnkHomeGlanceSession(clubId, cards) {
  const list = Array.isArray(cards) ? cards : []
  if (!list.length) {
    cache.invalidate({ clubId })
    return
  }
  cache.write(parts(clubId), { cards: list })
}

export function clearPnkHomeGlanceSession(clubId) {
  cache.invalidate({ clubId })
}

/**
 * Подтянуть last-good главной из свежего бандла доски (после Обновить / Sync правды).
 * @param {string} clubId
 * @param {object[]} clients — открытые ПНК из API
 * @param {{ boardHref?: string, now?: Date, notify?: boolean, bzCompletedByClient?: Record<string, number> | null }} [opts]
 */
export function syncPnkHomeGlanceFromBoard(clubId, clients, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  const boardHref = String(opts.boardHref ?? '').trim() || '/sales/pnk'
  const cards = buildPnkManagerHomeGlanceCards(clients, {
    boardHref,
    now: opts.now,
    bzCompletedByClient: opts.bzCompletedByClient ?? null,
  })
  writePnkHomeGlanceSession(cid, cards)
  if (opts.notify !== false) notifyPnkHomeGlanceChanged(cid, { source: 'board' })
  return cards
}

export function isPnkHomeGlanceFresh(savedAt, ttlMs = PNK_HOME_GLANCE_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}
