/**
 * Маркировка synced + восстановление очереди для локальных записей без sync_queue.
 */

import { buildPendingSyncKeysByTable, enqueueSync, getDb, putStore } from './localDb'
import {
  defaultSyncOperation,
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
]

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

  const storeByTable = {
    clients: 'clients',
    memberships: 'memberships',
    trainings: 'trainings',
    body_measurements: 'body_measurements',
    challenges: 'challenges',
    membership_types: 'membership_types',
    exercises: 'exercises',
  }
  const store = storeByTable[table_name]
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
