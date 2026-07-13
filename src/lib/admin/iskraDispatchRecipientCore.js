/** @typedef {'one' | 'several' | 'all'} DispatchRecipientMode */

/**
 * @param {string[]} ids
 * @param {string} id
 */
export function toggleDispatchRecipientId(ids, id) {
  const key = String(id ?? '').trim()
  if (!key) return ids ?? []
  const set = new Set((ids ?? []).map(String))
  if (set.has(key)) set.delete(key)
  else set.add(key)
  return [...set]
}

/**
 * @param {DispatchRecipientMode} mode
 * @param {{ singleId?: string, multiIds?: string[], options?: Array<{ trainer_id: string }> }} opts
 */
export function buildSelectedRecipientIds(mode, opts = {}) {
  const options = opts.options ?? []
  if (mode === 'all') return options.map((t) => String(t.trainer_id)).filter(Boolean)
  if (mode === 'several') return (opts.multiIds ?? []).map(String).filter(Boolean)
  const single = String(opts.singleId ?? '').trim()
  return single ? [single] : []
}

/**
 * @param {DispatchRecipientMode} mode
 * @param {number} selectedCount
 * @param {number} totalCount
 */
export function dispatchRecipientSendLabel(mode, selectedCount, totalCount) {
  if (mode === 'all') return `Поставить всем (${totalCount})`
  if (mode === 'several' && selectedCount > 1) return `Поставить (${selectedCount})`
  return 'Поставить задачу'
}
