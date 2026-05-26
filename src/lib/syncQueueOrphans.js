/**
 * Очередь sync после удаления клиента в облаке: снять insert/update и убрать локальные «хвосты».
 */
import { getDb, listSyncQueue, removeSyncItem } from './localDb'
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
  if (item) await dropLocalOrphanForSyncItem(item)
  return { ok: false, dropped: true, status, error: err }
}
