/**
 * Маркировка synced + восстановление очереди для локальных записей без sync_queue.
 */

import { buildPendingSyncKeysByTable, enqueueSync, getDb, putStore } from './localDb'
import {
  defaultSyncOperation,
  markRecordFromCloud,
  pickUnsyncedRecordsForEnqueue,
  recordForPush,
} from './syncUnsyncedCore'

export {
  defaultSyncOperation,
  markRecordFromCloud,
  pickUnsyncedRecordsForEnqueue,
  recordForPush,
  shouldEnqueueUnsyncedRecord,
} from './syncUnsyncedCore'

const UNSYNCED_SCAN = [
  { store: 'clients', table: 'clients', table_name: 'clients' },
  { store: 'memberships', table: 'memberships', table_name: 'memberships' },
  { store: 'trainings', table: 'trainings', table_name: 'trainings' },
  { store: 'health_cards', table: 'health_cards', table_name: 'health_cards' },
  { store: 'body_measurements', table: 'body_measurements', table_name: 'body_measurements' },
  { store: 'client_weight_entries', table: 'client_weight_entries', table_name: 'client_weight_entries' },
  { store: 'challenges', table: 'challenges', table_name: 'challenges' },
  { store: 'membership_types', table: 'membership_types', table_name: 'membership_types' },
  { store: 'nutrition_products', table: 'nutrition_products', table_name: 'nutrition_products' },
  { store: 'homework_presets', table: 'homework_presets', table_name: 'homework_presets' },
  { store: 'pnk_funnel_events', table: 'pnk_funnel_events', table_name: 'pnk_funnel_events' },
  { store: 'client_hall_lifecycle', table: 'client_hall_lifecycle', table_name: 'client_hall_lifecycle' },
]

const STORE_BY_TABLE = {
  clients: 'clients',
  memberships: 'memberships',
  trainings: 'trainings',
  body_measurements: 'body_measurements',
  client_weight_entries: 'client_weight_entries',
  challenges: 'challenges',
  membership_types: 'membership_types',
  exercises: 'exercises',
  nutrition_products: 'nutrition_products',
  homework_presets: 'homework_presets',
  pnk_funnel_events: 'pnk_funnel_events',
  client_hall_lifecycle: 'client_hall_lifecycle',
}

function recordStoreKey(table_name, payload) {
  if (table_name === 'health_cards') {
    return String(payload?.client_id ?? '').trim()
  }
  return String(payload?.id ?? '').trim()
}

/**
 * После успешного push: synced в IDB; если сервер вернул строку — подмешать, не затирая черновик.
 * @param {string} table_name
 * @param {object} pushedData
 * @param {object | null | undefined} [serverRecord]
 */
export async function applyPushRecordToLocal(table_name, pushedData, serverRecord) {
  if (!serverRecord || typeof serverRecord !== 'object') {
    await markRecordSynced(table_name, pushedData)
    return
  }

  if (table_name === 'health_cards') {
    const cid = String(serverRecord.client_id ?? pushedData?.client_id ?? '').trim()
    if (!cid) {
      await markRecordSynced(table_name, pushedData)
      return
    }
    const db = await getDb()
    const localRow = await db.get('health_cards', cid)
    const cloudRow = markRecordFromCloud(serverRecord)
    const { shouldApplyCloudRowOnPull } = await import('./syncPullGuardCore.js')
    if (
      localRow &&
      !shouldApplyCloudRowOnPull({
        localRow,
        cloudRow,
        storeName: 'health_cards',
        pendingByStore: null,
        recordKey: cid,
      })
    ) {
      await markRecordSynced(table_name, pushedData)
      return
    }
    await putStore('health_cards', { ...cloudRow, synced: true })
    return
  }

  const store = STORE_BY_TABLE[table_name]
  const key = recordStoreKey(table_name, serverRecord.id ? serverRecord : pushedData)
  if (!store || !key) {
    await markRecordSynced(table_name, pushedData)
    return
  }

  const db = await getDb()
  const localRow = await db.get(store, key)
  const cloudRow = markRecordFromCloud(serverRecord)
  const { shouldApplyCloudRowOnPull } = await import('./syncPullGuardCore.js')
  if (
    localRow &&
    !shouldApplyCloudRowOnPull({
      localRow,
      cloudRow,
      storeName: store,
      pendingByStore: null,
      recordKey: key,
    })
  ) {
    await markRecordSynced(table_name, pushedData)
    return
  }
  await putStore(store, { ...cloudRow, synced: true })
}

/** После успешного push — не ставить в очередь снова. */
export async function markRecordSynced(table_name, data) {
  const db = await getDb()
  const payload = data && typeof data === 'object' ? data : {}

  if (table_name === 'health_cards') {
    const cid = String(payload.client_id ?? '').trim()
    if (!cid) return
    const cur = await db.get('health_cards', cid)
    if (!cur) return
    const { __sync: _m, ...rest } = cur
    await putStore('health_cards', { ...rest, synced: true })
    return
  }

  const id = String(payload.id ?? '').trim()
  if (!id) return

  const store = STORE_BY_TABLE[table_name]
  if (!store) return

  const cur = await db.get(store, id)
  if (!cur) return
  const { __sync: _m, ...rest } = cur
  await putStore(store, { ...rest, synced: true })
}

/** @returns {Promise<{ total: number, byTable: Record<string, number> }>} */
export async function countUnsyncedLocalRecords() {
  const { reconcileMembershipTypesFromCloudCache } = await import('./membershipTypesService')
  await reconcileMembershipTypesFromCloudCache()

  const db = await getDb()
  const pending = await buildPendingSyncKeysByTable()
  const byTable = {}
  let total = 0

  for (const { store, table, table_name } of UNSYNCED_SCAN) {
    const rows = await db.getAll(store)
    const pendingKeys = pending[table] ?? new Set()
    const n = pickUnsyncedRecordsForEnqueue(rows, pendingKeys, table_name).length
    if (n > 0) byTable[table_name] = n
    total += n
  }

  return { total, byTable }
}

/** @returns {Promise<number>} */
export async function enqueueUnsyncedLocalRecords() {
  const { reconcileMembershipTypesFromCloudCache } = await import('./membershipTypesService')
  await reconcileMembershipTypesFromCloudCache()

  const db = await getDb()
  const pending = await buildPendingSyncKeysByTable()
  let enqueued = 0

  for (const { store, table, table_name } of UNSYNCED_SCAN) {
    const rows = await db.getAll(store)
    const pendingKeys = pending[table] ?? new Set()
    for (const row of pickUnsyncedRecordsForEnqueue(rows, pendingKeys, table_name)) {
      const meta = row.__sync && typeof row.__sync === 'object' ? row.__sync : null
      const fallback = defaultSyncOperation(table_name, row)
      const operation = meta?.operation ?? fallback.operation
      const remote_id = meta?.remote_id !== undefined ? meta.remote_id : fallback.remote_id
      await enqueueSync({
        table_name,
        operation,
        remote_id,
        data: recordForPush(row),
      })
      enqueued++
    }
  }

  return enqueued
}
