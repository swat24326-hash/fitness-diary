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
 * Форму можно показывать только когда URL и meta указывают на одну тренировку.
 * Иначе один кадр после смены вкладки рисует упражнения чужого черновика.
 * @param {{ routeId?: string | null, metaTrainingId?: string | null, loadState?: string, isNew?: boolean, clientId?: string | null }} opts
 */
export function isTrainingDraftUiAligned(opts = {}) {
  const loadState = String(opts.loadState ?? '')
  if (loadState !== 'ok') return false
  if (opts.isNew) {
    return Boolean(String(opts.clientId ?? '').trim())
  }
  const routeId = String(opts.routeId ?? '').trim()
  const metaId = String(opts.metaTrainingId ?? '').trim()
  if (!routeId || routeId === 'new' || !metaId) return false
  return routeId === metaId
}

/**
 * Снимок кэша совпадает с route и (если есть) с client_id.
 * @param {unknown} snapshot
 * @param {string | { trainingId?: string | null, clientId?: string | null } | null | undefined} [expect]
 */
export function isTrainingDraftSessionSnapshotReady(snapshot, expect) {
  if (!snapshot || typeof snapshot !== 'object') return false
  const tid = String(snapshot.meta?.trainingId ?? '').trim()
  if (!tid) return false
  const expectTid =
    typeof expect === 'string' || expect == null
      ? String(expect ?? '').trim()
      : String(expect.trainingId ?? '').trim()
  if (expectTid && tid !== expectTid) return false
  if (!(snapshot.loadState === 'ok' || snapshot.ready === true)) return false
  const expectClient =
    typeof expect === 'object' && expect != null ? String(expect.clientId ?? '').trim() : ''
  if (expectClient) {
    const snapClient = String(snapshot.client?.id ?? '').trim()
    if (snapClient && snapClient !== expectClient) return false
  }
  return true
}

/**
 * @param {{
 *   loadState?: string,
 *   meta?: { status?: string, trainingId?: string | null },
 *   workoutState?: object,
 *   trainingType?: string,
 *   trainingDate?: string,
 *   client?: object | null,
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
  const clientId = String(input.client?.id ?? '').trim()
  if (!clientId) return null
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
  if (!key || !isTrainingDraftSessionSnapshotReady(snapshot, { trainingId: key })) return false
  if (cache.has(key)) cache.delete(key)
  cache.set(key, { at: Date.now(), snapshot: cloneTrainingDraftSessionValue(snapshot) })
  while (cache.size > TRAINING_DRAFT_SESSION_CACHE_MAX) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
  return true
}

/**
 * @param {string | null | undefined} trainingId
 * @returns {{ at: number, snapshot: object } | null}
 */
export function takeTrainingDraftSessionEntry(trainingId) {
  const key = normalizeKey(trainingId)
  if (!key) return null
  const hit = cache.get(key)
  if (!hit) return null
  cache.delete(key)
  cache.set(key, hit)
  return {
    at: hit.at,
    snapshot: cloneTrainingDraftSessionValue(hit.snapshot),
  }
}

/** LRU bump; наружу — копия, чтобы UI не мутировал кэш. */
export function takeTrainingDraftSession(trainingId) {
  const entry = takeTrainingDraftSessionEntry(trainingId)
  return entry?.snapshot ?? null
}

/**
 * @param {string | null | undefined} trainingId
 * @returns {{ at: number, snapshot: object } | null}
 */
export function peekTrainingDraftSessionEntry(trainingId) {
  const key = normalizeKey(trainingId)
  if (!key) return null
  const hit = cache.get(key)
  if (!hit) return null
  return {
    at: hit.at,
    snapshot: cloneTrainingDraftSessionValue(hit.snapshot),
  }
}

/** @param {string | null | undefined} trainingId */
export function peekTrainingDraftSession(trainingId) {
  return peekTrainingDraftSessionEntry(trainingId)?.snapshot ?? null
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
 * Silent persist при рассинхроне URL/meta — риск записать чужие упражнения в другой черновик.
 * @param {{ silent?: boolean, routeId?: string | null, metaTrainingId?: string | null }} opts
 */
export function shouldBlockMismatchedDraftPersist(opts = {}) {
  if (!opts.silent) return false
  const routeId = String(opts.routeId ?? '').trim()
  const metaId = String(opts.metaTrainingId ?? '').trim()
  if (!routeId || routeId === 'new' || !metaId) return false
  return routeId !== metaId
}
