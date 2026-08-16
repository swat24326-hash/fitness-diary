/**
 * Last-known presence ПНК / планёрки / call-today на главной — чтобы слоты soft не «прыгали»
 * с false→true после первого fetch.
 *
 * Важно: админская главная (без enableCallToday) не должна затирать hasCallToday для менеджера —
 * кэш общий по clubId.
 */
import { createGlanceCache } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'admin-attention-presence',
  ttlMs: 60 * 60 * 1000,
})

function parts(clubId) {
  return [String(clubId ?? '').trim()]
}

/**
 * Чистый merge записи presence (без sessionStorage).
 * @param {{ hasPnk?: boolean, hasPlanerka?: boolean, hasCallToday?: boolean } | null | undefined} prev
 * @param {{
 *   hasPnk?: boolean,
 *   hasPlanerka?: boolean,
 *   hasCallToday?: boolean,
 *   touchCallToday?: boolean,
 * }} presence
 */
export function mergeAttentionPresencePayload(prev, presence) {
  const touchCall = Boolean(presence?.touchCallToday)
  return {
    hasPnk: Boolean(presence?.hasPnk),
    hasPlanerka: Boolean(presence?.hasPlanerka),
    hasCallToday: touchCall ? Boolean(presence?.hasCallToday) : Boolean(prev?.hasCallToday),
  }
}

/**
 * @returns {{ hasPnk: boolean, hasPlanerka: boolean, hasCallToday: boolean } | null}
 */
export function peekAttentionPresenceSession(clubId) {
  const payload = cache.peek(parts(clubId))
  if (!payload || typeof payload !== 'object') return null
  return {
    hasPnk: Boolean(payload.hasPnk),
    hasPlanerka: Boolean(payload.hasPlanerka),
    hasCallToday: Boolean(payload.hasCallToday),
  }
}

/**
 * @param {string} clubId
 * @param {{
 *   hasPnk?: boolean,
 *   hasPlanerka?: boolean,
 *   hasCallToday?: boolean,
 *   touchCallToday?: boolean,
 * }} presence
 */
export function writeAttentionPresenceSession(clubId, presence) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return
  const prev = peekAttentionPresenceSession(cid)
  cache.write(parts(cid), mergeAttentionPresencePayload(prev, presence))
}
