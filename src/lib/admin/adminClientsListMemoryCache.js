/**
 * In-memory снимок списка клиентов админа/менеджера — мгновенный «назад» с карточки.
 * Без React; TTL короткий; облако всё равно догоняет в фоне.
 */

const DEFAULT_TTL_MS = 90_000

/** @type {{ clubId: string, savedAt: number, clients: object[], memByClient: Record<string, object[]>, lifecycleRows: object[], trainerNameById: Record<string, string>, noTabletTrainerIds: string[], holdingTrainerIds: string[], truncated: boolean, source: string } | null} */
let snapshot = null

/**
 * @param {number} savedAt
 * @param {number} [now]
 * @param {number} [ttlMs]
 */
export function isAdminClientsListMemoryFresh(savedAt, now = Date.now(), ttlMs = DEFAULT_TTL_MS) {
  const t = Number(savedAt)
  if (!Number.isFinite(t) || t <= 0) return false
  return now - t <= ttlMs
}

/**
 * @param {string} clubId
 * @param {{ ttlMs?: number, now?: number }} [opts]
 */
export function peekAdminClientsListMemory(clubId, opts = {}) {
  const id = String(clubId ?? '').trim()
  if (!id || !snapshot || snapshot.clubId !== id) return null
  if (!isAdminClientsListMemoryFresh(snapshot.savedAt, opts.now ?? Date.now(), opts.ttlMs ?? DEFAULT_TTL_MS)) {
    return null
  }
  return snapshot
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeIdList(value) {
  if (value instanceof Set) return [...value].map(String)
  if (Array.isArray(value)) return value.map(String)
  return []
}

/**
 * @param {string} clubId
 * @param {{
 *   clients: object[],
 *   memByClient?: Record<string, object[]>,
 *   trainerNameById?: Record<string, string>,
 *   noTabletTrainerIds?: string[]|Set<string>,
 *   holdingTrainerIds?: string[]|Set<string>,
 *   lifecycleRows?: object[],
 *   truncated?: boolean,
 *   source?: string,
 * }} payload
 */
export function writeAdminClientsListMemory(clubId, payload) {
  const id = String(clubId ?? '').trim()
  if (!id || !payload || !Array.isArray(payload.clients)) return
  snapshot = {
    clubId: id,
    savedAt: Date.now(),
    clients: payload.clients,
    memByClient: payload.memByClient && typeof payload.memByClient === 'object' ? payload.memByClient : {},
    lifecycleRows: Array.isArray(payload.lifecycleRows) ? payload.lifecycleRows : [],
    trainerNameById:
      payload.trainerNameById && typeof payload.trainerNameById === 'object' ? payload.trainerNameById : {},
    noTabletTrainerIds: normalizeIdList(payload.noTabletTrainerIds),
    holdingTrainerIds: normalizeIdList(payload.holdingTrainerIds),
    truncated: Boolean(payload.truncated),
    source: String(payload.source ?? 'local'),
  }
}

/** @param {string} [clubId] — пусто = сбросить любой */
export function invalidateAdminClientsListMemory(clubId) {
  const id = String(clubId ?? '').trim()
  if (!id || (snapshot && snapshot.clubId === id)) snapshot = null
  if (!id) snapshot = null
}

/** @returns {number} */
export function adminClientsListMemoryTtlMs() {
  return DEFAULT_TTL_MS
}
