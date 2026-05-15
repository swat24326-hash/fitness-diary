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

export async function getAllStore(storeName) {
  const db = await getDb()
  return db.getAll(storeName)
}

export async function deleteFromStore(storeName, key) {
  const db = await getDb()
  await db.delete(storeName, key)
}
