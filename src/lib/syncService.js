import { supabase, isSupabaseConfigured } from './supabase'
import { getDb, listSyncQueue, removeSyncItem, enqueueSync, setOnlineFlag } from './localDb'

const ALLOWED_TABLES = new Set([
  'clients',
  'memberships',
  'trainings',
  'exercises',
  'body_measurements',
  'health_cards',
  'clubs',
  'users',
  'challenges',
  'sync_queue',
])

export function initConnectivityListeners() {
  const handler = () => setOnlineFlag(navigator.onLine)
  window.addEventListener('online', handler)
  window.addEventListener('offline', handler)
  setOnlineFlag(navigator.onLine)
  return () => {
    window.removeEventListener('online', handler)
    window.removeEventListener('offline', handler)
  }
}

/**
 * Отправка локальной очереди в Supabase (прямые insert/update/delete в целевые таблицы).
 */
export async function flushSyncQueue() {
  if (!navigator.onLine || !isSupabaseConfigured()) return { ok: false, reason: 'offline_or_stub' }

  const queue = await listSyncQueue()
  for (const item of queue) {
    const table = item.table_name
    if (!table || !ALLOWED_TABLES.has(table)) {
      await removeSyncItem(item.local_id)
      continue
    }
    try {
      const attempt = async (payload) => {
        if (item.operation === 'insert') {
          const { error } = await supabase.from(table).insert(payload)
          if (error) throw error
          return
        }
        if (item.operation === 'update' && item.remote_id) {
          const { error } = await supabase.from(table).update(payload).eq('id', item.remote_id)
          if (error) throw error
          return
        }
        if (item.operation === 'delete' && item.remote_id) {
          const { error } = await supabase.from(table).delete().eq('id', item.remote_id)
          if (error) throw error
        }
      }

      try {
        await attempt(item.data)
        await removeSyncItem(item.local_id)
        continue
      } catch (e) {
        // Совместимость: если на сервере нет колонки `goal` в health_cards,
        // не блокируем синк — повторяем без неё.
        const msg = String(e?.message ?? '')
        const needStripGoal =
          table === 'health_cards' &&
          item.data &&
          Object.prototype.hasOwnProperty.call(item.data, 'goal') &&
          (msg.toLowerCase().includes('goal') && (msg.toLowerCase().includes('column') || msg.toLowerCase().includes('could not find')))
        if (needStripGoal) {
          const nextData = { ...item.data }
          delete nextData.goal
          await attempt(nextData)
          await removeSyncItem(item.local_id)
          continue
        }
        throw e
      }
    } catch {
      const db = await getDb()
      const next = { ...item, retry_count: (item.retry_count ?? 0) + 1 }
      await db.put('sync_queue', next)
    }
  }
  return { ok: true }
}

export async function saveLocalWithSync(storeName, record, { table_name, operation, remote_id }) {
  const db = await getDb()
  await db.put(storeName, record)
  await enqueueSync({
    table_name,
    operation,
    remote_id: remote_id === undefined ? record.id : remote_id,
    data: record,
  })
  if (navigator.onLine) {
    await flushSyncQueue()
  }
}

export async function deleteLocalWithSync(storeName, key, table_name) {
  const db = await getDb()
  await db.delete(storeName, key)
  await enqueueSync({
    table_name,
    operation: 'delete',
    remote_id: key,
    data: {},
  })
  if (navigator.onLine) {
    await flushSyncQueue()
  }
}

/** В IndexedDB ключ `client_id`, на сервере удаление по `id` записи медкарты. */
export async function deleteHealthCardByClientId(clientId) {
  const db = await getDb()
  const hc = await db.get('health_cards', clientId)
  if (!hc) return
  await db.delete('health_cards', clientId)
  await enqueueSync({
    table_name: 'health_cards',
    operation: 'delete',
    remote_id: hc.id ?? null,
    data: {},
  })
  if (navigator.onLine) {
    await flushSyncQueue()
  }
}
