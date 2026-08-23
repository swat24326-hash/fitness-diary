/** Режимы вкладки «Статистика» клиента — URL, sessionStorage, валидация. */

import { isTrainingStatusCompleted } from './trainingPersistStatusCore.js'

export const CLIENT_STATS_MODES = ['measurements', 'weight', 'exercise', 'attendance']

/**
 * @param {unknown} raw
 * @returns {'measurements' | 'weight' | 'exercise' | 'attendance' | null}
 */
export function normalizeClientStatsMode(raw) {
  const m = String(raw ?? '').trim().toLowerCase()
  return CLIENT_STATS_MODES.includes(m) ? /** @type {const} */ (m) : null
}

/** @param {unknown} mode */
export function clientStatsModeNeedsTrainingsEnsure(mode) {
  const m = normalizeClientStatsMode(mode)
  return m === 'attendance' || m === 'weight' || m === 'exercise'
}

/** @param {object} detail */
export function shouldForceClientTrainingsEnsureOnReload(detail = {}) {
  const reason = String(detail?.reason ?? '')
  // client-hydrated — данные уже в IDB после hydrate; force → бесконечный цикл ensure.
  return reason === 'sync-complete'
}

/**
 * После hydrate / обновления абонов — только перечитать IDB, без ensure и без спиннера.
 * @param {object} detail
 */
export function shouldReloadClientStatsTrainingsLocalOnly(detail = {}) {
  const reason = String(detail?.reason ?? '')
  return reason === 'client-hydrated' || reason === 'memberships-refreshed'
}

/**
 * @param {string} clientId
 * @param {object} [detail]
 */
export function shouldReloadTrainerClientStatsForClient(clientId, detail = {}) {
  const cid = String(clientId ?? '').trim()
  const eventClient = String(detail?.clientId ?? '').trim()
  if (eventClient && cid && eventClient !== cid) return false
  const reason = String(detail?.reason ?? '')
  if (!reason) return true
  if (reason === 'sync-complete') return true
  if (reason === 'training-completed' || reason === 'membership-used-reconciled') return true
  if (reason === 'client-hydrated' || reason === 'memberships-refreshed') return true
  return ![
    'exercises',
    'challenge-trainings',
    'challenge-created',
    'challenge-deleted',
    'challenge-completed',
    'clubs-refresh',
    'admin-clients-cache',
  ].includes(reason)
}

/**
 * «За всё время» для статистики: min/max дат, max не позже сегодня.
 * @param {string} mode
 * @param {{ measurements?: object[], trainings?: object[] }} data
 * @param {string} todayIso
 * @returns {{ min: string, max: string } | null}
 */
export function resolveClientStatsAllTimeRange(mode, data, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  /** @type {string[]} */
  let dates = []
  if (mode === 'measurements') {
    dates = (data?.measurements ?? []).map((m) => String(m?.date ?? '').slice(0, 10)).filter(Boolean)
  } else {
    dates = (data?.trainings ?? [])
      .filter((t) => isTrainingStatusCompleted(t?.status))
      .map((t) => String(t?.date ?? '').slice(0, 10))
      .filter(Boolean)
  }
  if (!dates.length) return null
  const min = dates.reduce((a, b) => (a < b ? a : b))
  let max = dates.reduce((a, b) => (a > b ? a : b))
  if (/^\d{4}-\d{2}-\d{2}$/.test(today) && max > today) max = today
  return { min: String(min), max: String(max) }
}


/**
 * @param {string} clientId
 * @returns {string}
 */
export function clientStatsModeStorageKey(clientId) {
  return `fd:client-stats-mode:${String(clientId ?? '').trim()}`
}

/**
 * @param {string} clientId
 * @returns {'measurements' | 'weight' | 'exercise' | 'attendance' | null}
 */
export function readPersistedClientStatsMode(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid || typeof sessionStorage === 'undefined') return null
  try {
    return normalizeClientStatsMode(sessionStorage.getItem(clientStatsModeStorageKey(cid)))
  } catch {
    return null
  }
}

/**
 * @param {string} clientId
 * @param {string} mode
 */
export function persistClientStatsMode(clientId, mode) {
  const cid = String(clientId ?? '').trim()
  const m = normalizeClientStatsMode(mode)
  if (!cid || !m || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(clientStatsModeStorageKey(cid), m)
  } catch {
    /* quota / private mode */
  }
}
