/**
 * Очередь sync после удаления клиента в облаке: снять insert/update и убрать локальные «хвосты».
 */
import { getDb, listSyncQueue, removeSyncItem } from './localDb'

export function isUnrecoverablePushError(status, message) {
  const code = Number(status)
  const msg = String(message ?? '').toLowerCase()
  if (code !== 403 && code !== 404) return false
  return (
    msg.includes('нет доступа к клиенту') ||
    msg.includes('тренировка не найдена') ||
    msg.includes('абонемент не найден') ||
    msg.includes('закреплён за другим') ||
    msg.includes('нет доступа') ||
    msg.includes('не найден')
  )
}

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
  let removed = 0
  for (const item of queue) {
    const op = item.operation
    if (op !== 'insert' && op !== 'update') continue
    const tbl = item.table_name
    if (!['trainings', 'memberships', 'health_cards', 'body_measurements', 'clients'].includes(tbl)) continue

    const d = item.data && typeof item.data === 'object' ? item.data : {}
    let orphan = false
    if (tbl === 'clients') {
      const recordId = String(d.id ?? item.remote_id ?? '').trim()
      orphan = !!recordId && !ids.has(recordId)
    } else {
      const clientId = String(d.client_id ?? '').trim()
      orphan = !!clientId && !ids.has(clientId)
    }
    if (!orphan) continue

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

const INSERT_STORE_BY_TABLE = {
  clients: 'clients',
  trainings: 'trainings',
  memberships: 'memberships',
  health_cards: 'health_cards',
}

/**
 * Снять «залипшие» insert: запись уже в IndexedDB (после pull с другого устройства), очередь не нужна.
 */
export async function pruneRedundantSyncQueue() {
  const queue = await listSyncQueue()
  const db = await getDb()
  let removed = 0

  for (const item of queue) {
    if ((item.retry_count ?? 0) >= 8) {
      await removeSyncItem(item.local_id)
      removed++
      continue
    }

    if (item.operation !== 'insert') continue
    const storeName = INSERT_STORE_BY_TABLE[item.table_name]
    if (!storeName) continue

    const d = item.data && typeof item.data === 'object' ? item.data : {}
    const key =
      item.table_name === 'health_cards'
        ? String(d.client_id ?? item.remote_id ?? '').trim()
        : String(item.remote_id ?? d.id ?? '').trim()
    if (!key) continue

    try {
      const existing = await db.get(storeName, key)
      if (existing) {
        await removeSyncItem(item.local_id)
        removed++
      }
    } catch {
      /* ignore */
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
