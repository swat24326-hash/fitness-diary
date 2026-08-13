import { openDB } from 'idb'
import { cloudPutAllowedOnPull } from './syncPullGuardCore.js'

const DB_NAME = 'fitness-diary'
/** Повышать при схемных правках; клиенты уже на max version не получают upgrade без нового номера. */
const DB_VERSION = 16

/**
 * Локальное хранилище: кэш сущностей + очередь синхронизации (поля как в sync_queue на сервере + local_id).
 */
export async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
      }
      if (!db.objectStoreNames.contains('clients')) {
        const clients = db.createObjectStore('clients', { keyPath: 'id' })
        clients.createIndex('by_club_id', 'club_id', { unique: false })
        clients.createIndex('by_trainer_id', 'trainer_id', { unique: false })
      }
      if (!db.objectStoreNames.contains('memberships')) {
        const memberships = db.createObjectStore('memberships', { keyPath: 'id' })
        memberships.createIndex('by_club_id', 'club_id', { unique: false })
        memberships.createIndex('by_client_id', 'client_id', { unique: false })
      }
      if (!db.objectStoreNames.contains('trainings')) {
        const trainings = db.createObjectStore('trainings', { keyPath: 'id' })
        trainings.createIndex('by_club_id', 'club_id', { unique: false })
        trainings.createIndex('by_trainer_id', 'trainer_id', { unique: false })
        trainings.createIndex('by_client_id', 'client_id', { unique: false })
        trainings.createIndex('by_club_date', ['club_id', 'date'], { unique: false })
      }
      if (!db.objectStoreNames.contains('exercises')) {
        db.createObjectStore('exercises', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('body_measurements')) {
        const body = db.createObjectStore('body_measurements', { keyPath: 'id' })
        body.createIndex('by_client_id', 'client_id', { unique: false })
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
        const challenges = db.createObjectStore('challenges', { keyPath: 'id' })
        challenges.createIndex('by_club_id', 'club_id', { unique: false })
      }

      if (!db.objectStoreNames.contains('membership_types')) {
        db.createObjectStore('membership_types', { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains('nutrition_products')) {
        const nutrition = db.createObjectStore('nutrition_products', { keyPath: 'id' })
        nutrition.createIndex('by_club_id', 'club_id', { unique: false })
      }

      if (!db.objectStoreNames.contains('homework_presets')) {
        const homework = db.createObjectStore('homework_presets', { keyPath: 'id' })
        homework.createIndex('by_club_id', 'club_id', { unique: false })
      }

      if (!db.objectStoreNames.contains('client_weight_entries')) {
        const weight = db.createObjectStore('client_weight_entries', { keyPath: 'id' })
        weight.createIndex('by_client_id', 'client_id', { unique: false })
      }

      if (oldVersion < 8 && transaction) {
        for (const storeName of ['clients', 'trainings', 'memberships']) {
          if (!db.objectStoreNames.contains(storeName)) continue
          const store = transaction.objectStore(storeName)
          if (!store.indexNames.contains('by_club_id')) {
            store.createIndex('by_club_id', 'club_id', { unique: false })
          }
        }
      }

      if (oldVersion < 9 && transaction) {
        if (db.objectStoreNames.contains('clients')) {
          const store = transaction.objectStore('clients')
          if (!store.indexNames.contains('by_trainer_id')) {
            store.createIndex('by_trainer_id', 'trainer_id', { unique: false })
          }
        }
        if (db.objectStoreNames.contains('memberships')) {
          const store = transaction.objectStore('memberships')
          if (!store.indexNames.contains('by_client_id')) {
            store.createIndex('by_client_id', 'client_id', { unique: false })
          }
        }
        if (db.objectStoreNames.contains('trainings')) {
          const store = transaction.objectStore('trainings')
          if (!store.indexNames.contains('by_trainer_id')) {
            store.createIndex('by_trainer_id', 'trainer_id', { unique: false })
          }
          if (!store.indexNames.contains('by_client_id')) {
            store.createIndex('by_client_id', 'client_id', { unique: false })
          }
          if (!store.indexNames.contains('by_club_date')) {
            store.createIndex('by_club_date', ['club_id', 'date'], { unique: false })
          }
        }
        if (db.objectStoreNames.contains('body_measurements')) {
          const store = transaction.objectStore('body_measurements')
          if (!store.indexNames.contains('by_client_id')) {
            store.createIndex('by_client_id', 'client_id', { unique: false })
          }
        }
      }

      if (oldVersion < 10 && transaction && db.objectStoreNames.contains('challenges')) {
        const store = transaction.objectStore('challenges')
        if (!store.indexNames.contains('by_club_id')) {
          store.createIndex('by_club_id', 'club_id', { unique: false })
        }
      }

      if (oldVersion < 13) {
        if (!db.objectStoreNames.contains('outreach_log')) {
          const outreach = db.createObjectStore('outreach_log', { keyPath: 'id' })
          outreach.createIndex('by_client_id', 'client_id', { unique: false })
          outreach.createIndex('by_trainer_id', 'trainer_id', { unique: false })
        }
        if (!db.objectStoreNames.contains('club_iskra_settings')) {
          db.createObjectStore('club_iskra_settings', { keyPath: 'club_id' })
        }
      }

      if (oldVersion < 15) {
        if (!db.objectStoreNames.contains('pnk_funnel_events')) {
          const events = db.createObjectStore('pnk_funnel_events', { keyPath: 'id' })
          events.createIndex('by_club_id', 'club_id', { unique: false })
          events.createIndex('by_trainer_id', 'trainer_id', { unique: false })
        }
      }

      if (oldVersion < 16) {
        if (!db.objectStoreNames.contains('sale_clips')) {
          const clips = db.createObjectStore('sale_clips', { keyPath: 'id' })
          clips.createIndex('by_club_id', 'club_id', { unique: false })
          clips.createIndex('by_trainer_id', 'trainer_id', { unique: false })
          clips.createIndex('by_client_id', 'client_id', { unique: false })
          clips.createIndex('by_status', 'status', { unique: false })
        }
      }
    },
  })
}

export async function setOnlineFlag(online) {
  await setMeta('online', online)
}

export async function getOnlineFlag() {
  const v = await getMeta('online')
  return v !== false
}

export async function getMeta(key) {
  const db = await getDb()
  return db.get('meta', key)
}

export async function setMeta(key, value) {
  const db = await getDb()
  await db.put('meta', value, key)
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
    membership_types: new Set(),
    nutrition_products: new Set(),
    homework_presets: new Set(),
    client_weight_entries: new Set(),
    pnk_funnel_events: new Set(),
    sale_clips: new Set(),
  }
  for (const item of queue) {
    const op = item.operation
    // insert/update — не затирать локальные правки; delete — не восстанавливать из облака
    if (op !== 'insert' && op !== 'update' && op !== 'delete') continue
    const t = item.table_name
    if (!keys[t]) continue
    const k = syncQueueItemKey(t, item)
    if (k) keys[t].add(k)
  }
  return keys
}

function cloudCachedRecord(record) {
  if (!record || typeof record !== 'object') return record
  const { __sync: _m, synced: _s, ...rest } = record
  return { ...rest, synced: true }
}

/**
 * putStore, но не затирает локальные правки и не восстанавливает удалённые
 * (пока insert/update/delete в очереди sync).
 * @returns {Promise<boolean>} false если запись пропущена из‑за очереди
 */
export async function putStoreUnlessPendingSync(storeName, record, pending) {
  const fromCloud = cloudCachedRecord(record)
  const key = recordKeyForStore(storeName, record)
  if (!cloudPutAllowedOnPull(storeName, key, pending)) return false
  await putStore(storeName, fromCloud)
  return true
}

export async function getAllStore(storeName) {
  const db = await getDb()
  return db.getAll(storeName)
}

export async function getAllKeysFromStore(storeName) {
  const db = await getDb()
  return db.getAllKeys(storeName)
}

export async function deleteFromStore(storeName, key) {
  const db = await getDb()
  await db.delete(storeName, key)
}

async function deleteAllByIndexKey(storeName, indexName, key) {
  const db = await getDb()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  let rows = []
  try {
    if (store.indexNames.contains(indexName)) {
      rows = await store.index(indexName).getAll(key)
    } else {
      rows = (await store.getAll()).filter((r) => String(r?.client_id ?? '') === key)
    }
    for (const row of rows) {
      if (row?.id != null) await store.delete(row.id)
    }
    await tx.done
  } catch {
    await tx.done
    rows = await db.getAll(storeName)
    for (const row of rows) {
      if (String(row?.client_id ?? '') !== key) continue
      await db.delete(storeName, row.id)
    }
  }
}

/** Убрать клиента из IndexedDB без очереди (после pull: на сервере уже удалён). */
export async function removeClientFromLocalCacheOnly(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return
  const db = await getDb()
  await deleteAllByIndexKey('trainings', 'by_client_id', cid)
  await deleteAllByIndexKey('memberships', 'by_client_id', cid)
  await deleteAllByIndexKey('body_measurements', 'by_client_id', cid)
  await deleteAllByIndexKey('client_weight_entries', 'by_client_id', cid)
  try {
    await db.delete('health_cards', cid)
  } catch {
    /* ignore */
  }
  await db.delete('clients', cid)
}
