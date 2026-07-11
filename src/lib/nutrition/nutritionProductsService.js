import { isSupabaseConfigured } from '../supabase'
import { getDb, putStore, listSyncQueue } from '../localDb'
import { saveLocalWithSync } from '../syncService'
import { pushRecordViaApi } from '../syncApiClient'
import { markRecordFromCloud, recordForPush } from '../syncUnsyncedCore'
import { NUTRITION_PRODUCT_CATALOG } from './nutritionProductCatalog.js'
import {
  normalizeNutritionProductRow,
  buildPendingNutritionProductKeys,
  shouldApplyRemoteNutritionProductRow,
  shouldDeleteLocalNutritionProductRow,
} from './nutritionProductsCore.js'

async function pushProductOp(operation, row, remoteId) {
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { cloudOk: false, cloudError: 'Нет сети — продукт только на этом устройстве. Нажмите Sync позже.' }
  }
  const push = await pushRecordViaApi({
    table_name: 'nutrition_products',
    operation,
    data: recordForPush(row),
    remote_id: remoteId ?? row.id ?? null,
    local_id: null,
  })
  return push.ok
    ? { cloudOk: true, record: push.record }
    : { cloudOk: false, cloudError: push.error ?? 'Не удалось отправить в облако' }
}

/** @param {string} clubId @param {{ activeOnly?: boolean }} [opts] */
export async function listNutritionProductsForClub(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  const db = await getDb()
  let list = (await db.getAll('nutrition_products')).filter((r) => String(r.club_id) === cid)
  if (opts.activeOnly) list = list.filter((r) => r.is_active !== false)
  return list
    .map((r) => normalizeNutritionProductRow(r))
    .filter(Boolean)
    .sort((a, b) => (a.sort_order - b.sort_order) || a.label.localeCompare(b.label, 'ru'))
}

/**
 * @param {{ club_id: string, label: string, macro_group: string, protein_per100?: number, fat_per100?: number, carbs_per100?: number, piece_grams?: number | null, tags?: string[], sort_order?: number }} input
 */
export async function insertNutritionProduct(input) {
  const row = normalizeNutritionProductRow({
    id: crypto.randomUUID(),
    club_id: input.club_id,
    label: input.label,
    macro_group: input.macro_group,
    protein_per100: input.protein_per100 ?? 0,
    fat_per100: input.fat_per100 ?? 0,
    carbs_per100: input.carbs_per100 ?? 0,
    piece_grams: input.piece_grams ?? null,
    tags: input.tags ?? [],
    sort_order: input.sort_order ?? 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (!row) return { cloudOk: false, cloudError: 'Некорректные данные продукта' }

  await saveLocalWithSync('nutrition_products', row, {
    table_name: 'nutrition_products',
    operation: 'insert',
    remote_id: null,
  })
  return pushProductOp('insert', row, null)
}

/** @param {string} id */
export async function deactivateNutritionProduct(id) {
  const pid = String(id ?? '').trim()
  if (!pid) return { cloudOk: false, cloudError: 'Нет id' }
  const db = await getDb()
  const prev = await db.get('nutrition_products', pid)
  if (!prev) return { cloudOk: false, cloudError: 'Продукт не найден' }
  const row = normalizeNutritionProductRow({ ...prev, is_active: false, updated_at: new Date().toISOString() })
  await saveLocalWithSync('nutrition_products', row, {
    table_name: 'nutrition_products',
    operation: 'update',
    remote_id: pid,
  })
  return pushProductOp('update', row, pid)
}

/** @param {string} clubId — вставить базовый набор, если клуб пуст */
export async function seedDefaultNutritionProductsForClub(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { count: 0, cloudOk: false, cloudError: 'Нет клуба' }
  const existing = await listNutritionProductsForClub(cid, { activeOnly: false })
  if (existing.length > 0) return { count: 0, cloudOk: true, skipped: true }

  let count = 0
  let lastError = null
  for (let i = 0; i < NUTRITION_PRODUCT_CATALOG.length; i++) {
    const p = NUTRITION_PRODUCT_CATALOG[i]
    const res = await insertNutritionProduct({
      club_id: cid,
      label: p.label,
      macro_group: p.group,
      protein_per100: p.proteinPer100,
      fat_per100: p.fatPer100,
      carbs_per100: p.carbsPer100,
      piece_grams: p.pieceGrams ?? null,
      tags: p.tags ?? [],
      sort_order: i,
    })
    if (res.cloudOk) count++
    else lastError = res.cloudError
  }
  return { count, cloudOk: count > 0, cloudError: lastError ?? undefined }
}

/** @param {string} clubId @param {object[]} remoteRows @param {{ forceFromCloud?: boolean }} [opts] */
export async function mergeNutritionProductsForClub(clubId, remoteRows, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { count: 0 }
  const forceFromCloud = opts.forceFromCloud === true
  const { pendingUpdates, pendingInserts } = buildPendingNutritionProductKeys(await listSyncQueue())

  const remoteIds = new Set()
  let count = 0
  for (const raw of remoteRows ?? []) {
    const row = normalizeNutritionProductRow(raw)
    if (!row || row.club_id !== cid) continue
    remoteIds.add(row.id)
    if (!shouldApplyRemoteNutritionProductRow({ id: row.id, forceFromCloud, pendingUpdates, pendingInserts })) continue
    await putStore('nutrition_products', markRecordFromCloud(row))
    count++
  }

  if (remoteIds.size > 0) {
    const db = await getDb()
    for (const local of await db.getAll('nutrition_products')) {
      if (String(local.club_id) !== cid) continue
      const id = String(local.id)
      if (
        shouldDeleteLocalNutritionProductRow({
          id,
          remoteIds,
          forceFromCloud,
          pendingUpdates,
          pendingInserts,
        })
      ) {
        await db.delete('nutrition_products', id)
      }
    }
  }
  return { count }
}

export function notifyNutritionProductsChanged(clubId, detail = {}) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('fitness-diary-storage', {
        detail: { reason: 'nutrition-products', clubId, ...detail },
      }),
    )
  } catch {
    /* ignore */
  }
}
