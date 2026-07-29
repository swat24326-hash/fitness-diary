/**
 * Session TTL для glance «Качество ведения» на главной админа.
 * Не путать с вечерним ритмом продаж: инвалидация по TTL / Sync / смене клуба.
 */
const PREFIX = 'fd-cq-glance:v1:'
export const COACH_QUALITY_GLANCE_TTL_MS = 20 * 60 * 1000

function storageKey(clubId, dateFrom, dateTo) {
  return `${PREFIX}${clubId}:${dateFrom}:${dateTo}`
}

/**
 * @returns {{ glance: object, savedAt: number } | null}
 */
export function readCoachQualityGlanceSession(clubId, dateFrom, dateTo) {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(storageKey(clubId, dateFrom, dateTo))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.glance || typeof parsed.savedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function writeCoachQualityGlanceSession(clubId, dateFrom, dateTo, glance) {
  try {
    if (typeof sessionStorage === 'undefined' || !glance) return
    sessionStorage.setItem(
      storageKey(clubId, dateFrom, dateTo),
      JSON.stringify({ glance, savedAt: Date.now() }),
    )
  } catch {
    /* quota */
  }
}

export function clearCoachQualityGlanceSession(clubId) {
  try {
    if (typeof sessionStorage === 'undefined') return
    const prefix = `${PREFIX}${String(clubId ?? '').trim()}:`
    const toRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(prefix)) toRemove.push(k)
    }
    for (const k of toRemove) sessionStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

export function isCoachQualityGlanceFresh(savedAt, ttlMs = COACH_QUALITY_GLANCE_TTL_MS) {
  return typeof savedAt === 'number' && Date.now() - savedAt < ttlMs
}
