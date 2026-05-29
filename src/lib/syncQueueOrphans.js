/**
 * Очередь sync после удаления клиента в облаке: снять insert/update и убрать локальные «хвосты».
 */
import { getDb, listSyncQueue, removeSyncItem } from './localDb'
import { markRecordSynced } from './syncLocalRecords'
import {
  isSyncQueueOrphanForCloudClients,
  isUnrecoverablePushError,
  pendingClientInsertIdsFromQueue,
} from './syncFlushResult'

export { isUnrecoverablePushError } from './syncFlushResult'

/** Удалить локальную запись, которую сервер больше не примет. */
export async function dropLocalOrphanForSyncItem(item) {
  const tbl = item.table_name
  const d = item.data && typeof item.data === 'object' ? item.data : {}
  const id = String(item.remote_id ?? d.id ?? '').trim()
  if (!id) return

  const db = await getDb()
  if (tbl === 'trainings') {
    try {
      await db.delete('trainings', id)
    } catch {
      /* ignore */
    }
    return
  }
  if (tbl === 'memberships') {
    try {
      await db.delete('memberships', id)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Снять insert/update по клиентам, которых уже нет в облаке (после pull/reconcile).
 * @param {Iterable<string>} remoteClientIds
 */
export async function purgeSyncQueueForMissingClients(remoteClientIds) {
  const ids = new Set([...remoteClientIds].map((x) => String(x)).filter(Boolean))
  if (!ids.size) return { removed: 0 }

  const queue = await listSyncQueue()
  const pendingClients = pendingClientInsertIdsFromQueue(queue)
  let removed = 0
  for (const item of queue) {
    if (!isSyncQueueOrphanForCloudClients(item, ids, pendingClients)) continue

    await removeSyncItem(item.local_id)
    await dropLocalOrphanForSyncItem(item)
    removed++
  }
  return { removed }
}

/** Снять очередь по client_id, которых уже нет в IndexedDB (после reconcile на устройстве). */
export async function purgeSyncQueueAgainstLocalClients() {
  const db = await getDb()
  const localIds = new Set((await db.getAll('clients')).map((c) => String(c.id)).filter(Boolean))
  return purgeSyncQueueForMissingClients(localIds)
}

/**
 * Снять только безнадёжные insert в справочник упражнений (много ошибок).
 * Не снимаем insert клиентов/тренировок по факту наличия в IndexedDB — это нормальный офлайн-сценарий.
 */
export async function pruneRedundantSyncQueue() {
  const queue = await listSyncQueue()
  let removed = 0

  for (const item of queue) {
    if ((item.retry_count ?? 0) >= 8 && item.table_name === 'exercises' && item.operation === 'insert') {
      await removeSyncItem(item.local_id)
      removed++
    }
  }

  return { removed }
}

function entityIdForQueueItem(item) {
  const d = item.data && typeof item.data === 'object' ? item.data : {}
  return String(item.remote_id ?? d.id ?? '').trim()
}

/**
 * Схлопнуть лишние update/delete по одной сущности (оставить последнюю операцию).
 * Убирает «хвост» из десятков update одного клиента перед отправкой.
 */
export async function collapseRedundantQueueItems() {
  const queue = await listSyncQueue()
  /** @type {Map<string, { keep: typeof queue[0], drop: string[] }>} */
  const byEntity = new Map()
  let removed = 0

  for (const item of queue) {
    const op = item.operation
    if (op !== 'update' && op !== 'delete') continue
    const entityId = entityIdForQueueItem(item)
    if (!entityId) continue
    const key = `${item.table_name}:${entityId}`
    const prev = byEntity.get(key)
    if (!prev) {
      byEntity.set(key, { keep: item, drop: [] })
      continue
    }
    prev.drop.push(prev.keep.local_id)
    prev.keep = item
  }

  for (const { keep, drop } of byEntity.values()) {
    for (const localId of drop) {
      if (localId === keep.local_id) continue
      await removeSyncItem(localId)
      removed++
    }
    if (keep.operation === 'delete') {
      for (const other of queue) {
        if (other.local_id === keep.local_id) continue
        if (other.table_name !== keep.table_name) continue
        if (entityIdForQueueItem(other) !== entityIdForQueueItem(keep)) continue
        if (other.operation === 'insert' || other.operation === 'update') {
          await removeSyncItem(other.local_id)
          removed++
        }
      }
    }
  }

  return { removed }
}

/** Несколько insert одной сущности — оставить последний. */
export async function collapseDuplicateQueueInserts() {
  const queue = await listSyncQueue()
  /** @type {Map<string, string>} */
  const lastLocalIdByKey = new Map()
  let removed = 0

  for (const item of queue) {
    if (item.operation !== 'insert') continue
    const entityId = entityIdForQueueItem(item)
    if (!entityId) continue
    const key = `${item.table_name}:${entityId}`
    const prevLocalId = lastLocalIdByKey.get(key)
    if (prevLocalId) {
      await removeSyncItem(prevLocalId)
      removed++
    }
    lastLocalIdByKey.set(key, item.local_id)
  }

  return { removed }
}

/**
 * Обработать ответ push-record: снять очередь и локальный хвост, чтобы не спамить 403.
 * @returns {Promise<{ ok: boolean, dropped?: boolean, error?: string, status?: number }>}
 */
export async function handlePushApiFailure({ status, error, local_id, item }) {
  const err = String(error ?? '')
  if (!isUnrecoverablePushError(status, err)) {
    return { ok: false, status, error: err }
  }
  if (local_id) {
    try {
      await removeSyncItem(local_id)
    } catch {
      /* ignore */
    }
  }
  if (item?.data) {
    try {
      await markRecordSynced(item.table_name, item.data)
    } catch {
      /* ignore */
    }
    // Локальный insert, который сервер отклонил — убрать «призрак», update/delete только помечаем synced.
    if (item.operation === 'insert') {
      await dropLocalOrphanForSyncItem(item)
    }
  }
  return { ok: false, dropped: true, status, error: err }
}
