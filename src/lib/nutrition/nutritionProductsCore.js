/**
 * Нормализация строк nutrition_products и merge при pull.
 */

/** @param {object[]} [syncQueueItems] */
export function buildPendingNutritionProductKeys(syncQueueItems) {
  const pendingUpdates = new Set()
  const pendingInserts = new Set()
  for (const item of syncQueueItems ?? []) {
    if (item.table_name !== 'nutrition_products') continue
    if (item.operation === 'insert') {
      const id = String(item.data?.id ?? '').trim()
      if (id) pendingInserts.add(id)
      continue
    }
    if (item.operation === 'update') {
      const id = String(item.remote_id ?? item.data?.id ?? '').trim()
      if (id) pendingUpdates.add(id)
    }
  }
  return { pendingUpdates, pendingInserts }
}

export function shouldApplyRemoteNutritionProductRow(p) {
  const id = String(p.id ?? '').trim()
  if (!id) return false
  if (p.pendingInserts.has(id)) return false
  if (!p.forceFromCloud && p.pendingUpdates.has(id)) return false
  return true
}

export function shouldDeleteLocalNutritionProductRow(p) {
  const id = String(p.id ?? '').trim()
  if (!id || p.remoteIds.has(id)) return false
  if (p.pendingInserts.has(id)) return false
  if (!p.forceFromCloud && p.pendingUpdates.has(id)) return false
  return true
}

/**
 * @param {unknown} raw
 */
export function normalizeNutritionProductRow(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (raw)
  const id = String(r.id ?? '').trim()
  const clubId = String(r.club_id ?? '').trim()
  const label = String(r.label ?? '').trim().slice(0, 80)
  const macro = String(r.macro_group ?? r.group ?? '').trim()
  if (!id || !clubId || !label) return null
  if (!['protein', 'fat', 'carbs'].includes(macro)) return null
  const tags = Array.isArray(r.tags) ? r.tags.map(String) : []
  const piece = r.piece_grams != null && r.piece_grams !== '' ? Number(r.piece_grams) : null
  return {
    id,
    club_id: clubId,
    label,
    macro_group: macro,
    protein_per100: Number(r.protein_per100) || 0,
    fat_per100: Number(r.fat_per100) || 0,
    carbs_per100: Number(r.carbs_per100) || 0,
    piece_grams: Number.isFinite(piece) && piece > 0 ? piece : null,
    tags,
    sort_order: Number(r.sort_order) || 0,
    is_active: r.is_active !== false,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  }
}

export const NUTRITION_MACRO_GROUP_LABELS = {
  protein: 'Белки',
  fat: 'Жиры',
  carbs: 'Углеводы',
}
