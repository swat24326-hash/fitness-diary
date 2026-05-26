import { openDB } from 'idb'

const DB_NAME = 'fitness-diary'
/** Повышать при схемных правках; клиенты уже на max version не получают upgrade без нового номера. */
const DB_VERSION = 6

/**
 * Локальное хранилище: кэш сущностей + очередь синхронизации (поля как в sync_queue на сервере + local_id).
 */
export async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
      }
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('memberships')) {
        db.createObjectStore('memberships', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('trainings')) {
        db.createObjectStore('trainings', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('exercises')) {
        db.createObjectStore('exercises', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('body_measurements')) {
        db.createObjectStore('body_measurements', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('health_cards')) {
        db.createObjectStore('health_cards', { keyPath: 'client_id' })
      }
      if (!db.objectStoreNames.contains('clubs')) {
        db.createObjectStore('clubs', { keyPath: 'id' })
      }

      if (oldVersion < 2) {
        if (db.objectStoreNames.contains('membership_events')) {
          db.deleteObjectStore('membership_events')
        }
        if (db.objectStoreNames.contains('sync_queue')) {
          db.deleteObjectStore('sync_queue')
        }
      }

      if (!db.objectStoreNames.contains('sync_queue')) {
        const q = db.createObjectStore('sync_queue', { keyPath: 'local_id', autoIncrement: false })
        q.createIndex('by_created', 'created_at')
      }

      /* Челленджи: в конце upgrade — если стора нет (старые v3/v4, сбой миграции), создаём */
      if (!db.objectStoreNames.contains('challenges')) {
        db.createObjectStore('challenges', { keyPath: 'id' })
      }
    },
  })
}

export async function setOnlineFlag(online) {
  const db = await getDb()
  await db.put('meta', online, 'online')
}

export async function getOnlineFlag() {
  const db = await getDb()
  const v = await db.get('meta', 'online')
  return v !== false
}

const newLocalId = () => crypto.randomUUID()

/** Очередь: table_name, operation, data — как на сервере; remote_id только на клиенте для update/delete */
export async function enqueueSync({ table_name, operation, remote_id, data }) {
  const db = await getDb()
  const local_id = newLocalId()
  const row = {
    local_id,
    table_name,
    operation,
    remote_id: remote_id ?? null,
    data: data ?? {},
    created_at: Date.now(),
    retry_count: 0,
    synced_at: null,
  }
  await db.add('sync_queue', row)
  return row
}

export async function listSyncQueue() {
  const db = await getDb()
  return db.getAllFromIndex('sync_queue', 'by_created')
}

export async function removeSyncItem(local_id) {
  const db = await getDb()
  await db.delete('sync_queue', local_id)
}

export async function putStore(storeName, record) {
  const db = await getDb()
  await db.put(storeName, record)
}

const PULL_MERGE_GUARD_STORES = new Set([
  'clients',
  'memberships',
  'trainings',
  'health_cards',
  'body_measurements',
])

function syncQueueItemKey(tableName, item) {
  if (tableName === 'health_cards') {
    return String(item.data?.client_id ?? item.remote_id ?? item.data?.id ?? '').trim()
  }
  return String(item.remote_id ?? item.data?.id ?? '').trim()
}

function recordKeyForStore(storeName, record) {
  if (storeName === 'health_cards') {
    return String(record?.client_id ?? record?.id ?? '').trim()
  }
  return String(record?.id ?? '').trim()
}

/** id записей, ожидающих отправку в sync_queue — pull не должен их перезаписывать. */
export async function buildPendingSyncKeysByTable() {
  const queue = await listSyncQueue()
  const keys = {
    clients: new Set(),
    memberships: new Set(),
    trainings: new Set(),
    health_cards: new Set(),
    body_measurements: new Set(),
    challenges: new Set(),
    exercises: new Set(),
  }
  for (const item of queue) {
    const op = item.operation
    if (op !== 'insert' && op !== 'update') continue
    const t = item.table_name
    if (!keys[t]) continue
    const k = syncQueueItemKey(t, item)
    if (k) keys[t].add(k)
  }
  return keys
}

/**
 * putStore, но не затирает локальные правки, ещё не ушедшие в облако.
 * @returns {Promise<boolean>} false если запись пропущена из‑за очереди
 */
export async function putStoreUnlessPendingSync(storeName, record, pending) {
  if (!PULL_MERGE_GUARD_STORES.has(storeName)) {
    await putStore(storeName, record)
    return true
  }
  const key = recordKeyForStore(storeName, record)
  if (!key) {
    await putStore(storeName, record)
    return true
  }
  if (pending?.[storeName]?.has(key)) {
    const db = await getDb()
    const existing =
      storeName === 'health_cards' ? await db.get('health_cards', key) : await db.get(storeName, key)
    if (existing) return false
  }
  await putStore(storeName, record)
  return true
}

export async function getAllStore(storeName) {
  const db = await getDb()
  return db.getAll(storeName)
}

export async function deleteFromStore(storeName, key) {
  const db = await getDb()
  await db.delete(storeName, key)
}

/** Убрать клиента из IndexedDB без очереди (после pull: на сервере уже удалён). */
export async function removeClientFromLocalCacheOnly(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return
  const db = await getDb()
  for (const t of await db.getAll('trainings')) {
    if (String(t.client_id) === cid) await db.delete('trainings', t.id)
  }
  for (const m of await db.getAll('memberships')) {
    if (String(m.client_id) === cid) await db.delete('memberships', m.id)
  }
  for (const b of await db.getAll('body_measurements')) {
    if (String(b.client_id) === cid) await db.delete('body_measurements', b.id)
  }
  try {
    await db.delete('health_cards', cid)
  } catch {
    /* ignore */
  }
  await db.delete('clients', cid)
}
