/**
 * Сессионный кэш экрана черновика: быстрый сплит вкладок без «Загрузка…».
 * Память только вкладки браузера (не IDB / не sync). Ключ = training id.
 */

export const TRAINING_DRAFT_SESSION_CACHE_MAX = 12

/** @type {Map<string, { at: number, snapshot: object }>} */
const cache = new Map()

function normalizeKey(trainingId) {
  const id = String(trainingId ?? '').trim()
  if (!id || id === 'new') return ''
  return id
}

/** @param {unknown} value */
export function cloneTrainingDraftSessionValue(value) {
  if (value == null) return value
  try {
    if (typeof structuredClone === 'function') return structuredClone(value)
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

/**
 * @param {{
 *   loadState?: string,
 *   meta?: { status?: string, trainingId?: string | null },
 *   workoutState?: object,
 *   trainingType?: string,
 *   trainingDate?: string,
 *   client?: object | null,
 *   healthCard?: object | null,
 *   contra?: string,
 *   membershipSummary?: object | null,
 *   otherCompletedTrainings?: number,
 *   lateBlockedNotice?: string,
 * }} input
 * @returns {object | null}
 */
export function buildTrainingDraftSessionSnapshot(input = {}) {
  if (String(input.loadState ?? '') !== 'ok') return null
  const trainingId = String(input.meta?.trainingId ?? '').trim()
  if (!trainingId) return null
  return {
    ready: true,
    loadState: 'ok',
    meta: {
      status: String(input.meta?.status ?? 'draft'),
      trainingId,
    },
    workoutState: cloneTrainingDraftSessionValue(input.workoutState) ?? {},
    trainingType: input.trainingType || 'Силовая',
    trainingDate: String(input.trainingDate ?? ''),
    client: cloneTrainingDraftSessionValue(input.client) ?? null,
    healthCard: cloneTrainingDraftSessionValue(input.healthCard) ?? null,
    contra: String(input.contra ?? ''),
    membershipSummary: cloneTrainingDraftSessionValue(input.membershipSummary) ?? null,
    otherCompletedTrainings: Number(input.otherCompletedTrainings) || 0,
    lateBlockedNotice: String(input.lateBlockedNotice ?? ''),
  }
}

/**
 * @param {string | null | undefined} trainingId
 * @param {object} snapshot
 */
export function putTrainingDraftSession(trainingId, snapshot) {
  const key = normalizeKey(trainingId)
  if (!key || !isTrainingDraftSessionSnapshotReady(snapshot)) return false
  if (String(snapshot.meta?.trainingId ?? '').trim() !== key) return false
  if (cache.has(key)) cache.delete(key)
  cache.set(key, { at: Date.now(), snapshot: cloneTrainingDraftSessionValue(snapshot) })
  while (cache.size > TRAINING_DRAFT_SESSION_CACHE_MAX) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  return true
}

/** LRU bump; наружу — копия, чтобы UI не мутировал кэш. */
export function takeTrainingDraftSession(trainingId) {
  const key = normalizeKey(trainingId)
  if (!key) return null
  const hit = cache.get(key)
  if (!hit) return null
  cache.delete(key)
  cache.set(key, hit)
  return cloneTrainingDraftSessionValue(hit.snapshot)
}

/** @param {string | null | undefined} trainingId */
export function peekTrainingDraftSession(trainingId) {
  const key = normalizeKey(trainingId)
  if (!key) return null
  const snap = cache.get(key)?.snapshot
  return snap ? cloneTrainingDraftSessionValue(snap) : null
}

export function dropTrainingDraftSession(trainingId) {
  const key = normalizeKey(trainingId)
  if (!key) return false
  return cache.delete(key)
}

export function clearTrainingDraftSessionCache() {
  cache.clear()
}

/** @returns {number} */
export function trainingDraftSessionCacheSize() {
  return cache.size
}

/**
 * Можно ли показать снимок сразу (без экрана «Загрузка…»).
 * @param {unknown} snapshot
 * @param {string | null | undefined} [expectTrainingId]
 */
export function isTrainingDraftSessionSnapshotReady(snapshot, expectTrainingId) {
  if (!snapshot || typeof snapshot !== 'object') return false
  const tid = String(snapshot.meta?.trainingId ?? '').trim()
  if (!tid) return false
  if (expectTrainingId != null && String(expectTrainingId).trim() && tid !== String(expectTrainingId).trim()) {
    return false
  }
  return snapshot.loadState === 'ok' || snapshot.ready === true
}
