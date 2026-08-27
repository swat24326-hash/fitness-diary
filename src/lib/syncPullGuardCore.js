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
  'trainer_schedule_entries',
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
 * synced draft: не затираем пустым/черновым облаком, но completed из облака
 * (другой девайс завершил) — пропускаем дальше в shouldApplyCloudRowOnPull.
 * @param {object | null | undefined} localRow
 * @param {string} [storeName]
 * @param {object | null | undefined} [cloudRow]
 * @returns {boolean}
 */
export function shouldPreserveLocalRowFromCloudPull(localRow, storeName = '', cloudRow = null) {
  if (!localRow || typeof localRow !== 'object') return false
  if (localRow.synced === false) return true
  if (String(storeName ?? '') === 'trainings' && String(localRow.status ?? '') === 'draft') {
    const cloudStatus = String(cloudRow?.status ?? '')
    if (cloudStatus === 'completed') return false
    return true
  }
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
  if (shouldPreserveLocalRowFromCloudPull(localRow, storeName, cloudRow)) return false

  if (storeName === 'trainings') {
    const localStatus = String(localRow.status ?? '')
    const cloudStatus = String(cloudRow.status ?? '')
    // Completed на планшете не откатываем в draft из pull (битый/старый снимок).
    if (localStatus === 'completed' && cloudStatus !== 'completed') return false
    if (localStatus === 'completed' && cloudStatus === 'completed') {
      return rowRevisionMs(cloudRow) >= rowRevisionMs(localRow)
    }
    // synced draft ← cloud completed: берём completed, если не старше локального.
    if (localStatus === 'draft' && cloudStatus === 'completed') {
      const localMs = rowRevisionMs(localRow)
      const cloudMs = rowRevisionMs(cloudRow)
      if (localMs > 0 && cloudMs > 0 && cloudMs < localMs) return false
      return true
    }
  }

  // Клиенты и прочие guarded stores: не накатывать устаревший hydrate
  // (гонка: локальный патч уже ушёл в облако, а ответ старого GET ещё в полёте).
  if (isPullMergeGuardedStore(storeName)) {
    const localMs = rowRevisionMs(localRow)
    const cloudMs = rowRevisionMs(cloudRow)
    // Локальная ревизия новее (или у облака нет даты) — оставляем локальную.
    if (localMs > 0 && cloudMs < localMs) return false
  }

  return true
}
