/**
 * IDB last-good снимка баллов. Не sync_queue.
 */

import { getDb, putStore } from '../localDb.js'
import { loyaltyGlanceCacheRow, loyaltySnapshotFromCacheRow } from './loyaltyGlanceUiCore.js'

const STORE = 'loyalty_glance'

/** @param {string} clientId */
export async function getLoyaltyGlance(clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return null
  try {
    const db = await getDb()
    const row = await db.get(STORE, id)
    return loyaltySnapshotFromCacheRow(row)
  } catch {
    return null
  }
}

/**
 * @param {string[]} clientIds
 * @returns {Promise<Record<string, object>>}
 */
export async function getLoyaltyGlanceMany(clientIds) {
  const ids = [...new Set((clientIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean))]
  /** @type {Record<string, object>} */
  const out = {}
  if (!ids.length) return out
  try {
    const db = await getDb()
    await Promise.all(
      ids.map(async (id) => {
        const snap = loyaltySnapshotFromCacheRow(await db.get(STORE, id))
        if (snap) out[id] = snap
      }),
    )
  } catch {
    /* last-good пуст */
  }
  return out
}

/**
 * @param {string} clientId
 * @param {object} snapshot
 */
export async function putLoyaltyGlance(clientId, snapshot) {
  const row = loyaltyGlanceCacheRow(clientId, snapshot)
  if (!row) return false
  await putStore(STORE, row)
  return true
}

/**
 * @param {Record<string, object>} byId
 */
export async function putLoyaltyGlanceMany(byId) {
  const entries = Object.entries(byId ?? {})
  for (const [id, snap] of entries) {
    await putLoyaltyGlance(id, snap)
  }
}
