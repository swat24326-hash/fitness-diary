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
