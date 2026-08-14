/**
 * Last-known presence ПНК / планёрки / call-today на главной — чтобы слоты soft не «прыгали»
 * с false→true после первого fetch.
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

export function writeAttentionPresenceSession(clubId, presence) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return
  cache.write(parts(cid), {
    hasPnk: Boolean(presence?.hasPnk),
    hasPlanerka: Boolean(presence?.hasPlanerka),
    hasCallToday: Boolean(presence?.hasCallToday),
  })
}
