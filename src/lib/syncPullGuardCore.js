/**
 * Охрана pull: stores, для которых pending в sync_queue блокирует put из облака.
 * Единый список для localDb и verify.
 */
export const PULL_MERGE_GUARD_STORE_LIST = Object.freeze([
  'clients',
  'memberships',
  'trainings',
  'health_cards',
  'body_measurements',
  'client_weight_entries',
  'pnk_funnel_events',
  'sale_clips',
  'client_hall_lifecycle',
])

export const PULL_MERGE_GUARD_STORES = new Set(PULL_MERGE_GUARD_STORE_LIST)

export function isPullMergeGuardedStore(storeName) {
  return PULL_MERGE_GUARD_STORES.has(String(storeName ?? '').trim())
}

/**
 * @param {string} storeName
 * @param {string} recordKey
 * @param {Record<string, Set<string>> | null | undefined} pendingByStore
 * @returns {boolean} true = можно записать облачную строку
 */
export function cloudPutAllowedOnPull(storeName, recordKey, pendingByStore) {
  if (!isPullMergeGuardedStore(storeName)) return true
  const key = String(recordKey ?? '').trim()
  if (!key) return true
  if (pendingByStore?.[storeName]?.has(key)) return false
  return true
}

/**
 * @param {object | null | undefined} row
 * @returns {number}
 */
export function rowRevisionMs(row) {
  if (!row || typeof row !== 'object') return 0
  for (const field of ['updated_at', 'created_at']) {
    const ms = Date.parse(String(row[field] ?? ''))
    if (Number.isFinite(ms)) return ms
  }
  return 0
}

/**
 * Локальная строка важнее облака при pull (офлайн-first).
 * @param {object | null | undefined} localRow
 * @param {string} [storeName]
 * @returns {boolean}
 */
export function shouldPreserveLocalRowFromCloudPull(localRow, storeName = '') {
  if (!localRow || typeof localRow !== 'object') return false
  if (localRow.synced === false) return true
  if (String(storeName ?? '') === 'trainings' && String(localRow.status ?? '') === 'draft') return true
  return false
}

/**
 * Можно ли записать облачную строку поверх локальной при pull/hydrate.
 * @param {{
 *   localRow?: object | null,
 *   cloudRow?: object | null,
 *   storeName?: string,
 *   pendingByStore?: Record<string, Set<string>> | null,
 *   recordKey?: string,
 * }} ctx
 * @returns {boolean}
 */
export function shouldApplyCloudRowOnPull(ctx = {}) {
  const storeName = String(ctx.storeName ?? '').trim()
  const recordKey = String(ctx.recordKey ?? '').trim()
  const pendingByStore = ctx.pendingByStore ?? null
  const localRow = ctx.localRow ?? null
  const cloudRow = ctx.cloudRow ?? null

  if (!cloudRow || typeof cloudRow !== 'object') return false
  if (!cloudPutAllowedOnPull(storeName, recordKey, pendingByStore)) return false
  if (!localRow) return true
  if (shouldPreserveLocalRowFromCloudPull(localRow, storeName)) return false

  if (storeName === 'trainings') {
    const localStatus = String(localRow.status ?? '')
    const cloudStatus = String(cloudRow.status ?? '')
    if (localStatus === 'completed' && cloudStatus === 'completed') {
      return rowRevisionMs(cloudRow) >= rowRevisionMs(localRow)
    }
  }

  return true
}
