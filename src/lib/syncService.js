import { supabase, isSupabaseConfigured } from './supabase'
import { initNetworkReachability, getNetworkReachable } from './networkReachability'
import { getDb, listSyncQueue, removeSyncItem, enqueueSync, setOnlineFlag } from './localDb'
import { pushRecordViaApi, schedulePushRecordViaApi } from './syncApiClient'
import { invalidateTrainerWorkspaceCache } from './trainerWorkspaceCache'
import { invalidateAdminClubWorkspaceCache } from './admin/adminClubWorkspaceCache'

const TRAINER_CACHE_STORES = new Set(['clients', 'memberships', 'trainings', 'health_cards', 'body_measurements'])

const AUTO_PUSH_TABLES = new Set([
  'clients',
  'memberships',
  'trainings',
  'health_cards',
  'body_measurements',
  'challenges',
  'exercises',
])

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
  return initNetworkReachability((online) => {
    void setOnlineFlag(online)
    if (online) scheduleFlushSyncQueue({ force: true })
  })
}

/** Учитывает реальную доступность Supabase, не только navigator.onLine. */
export function isAppOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  return getNetworkReachable()
}

const DEMO_EXERCISE_NAMES = new Set(['Приседания со штангой', 'Жим штанги лёжа'])
const DEMO_CLUB_ID = '00000000-0000-4000-8000-000000000010'

/**
 * Убирает из очереди «застрявшие» insert в exercises/clubs (демо и повторные 409).
 * @param {{ aggressive?: boolean }} [opts] — после входа: снять все insert в справочниках (сервер — источник правды).
 */
export async function pruneStaleSyncInserts(opts = {}) {
  const aggressive = opts.aggressive === true
  const queue = await listSyncQueue()
  for (const item of queue) {
    if (item.operation !== 'insert') continue
    const retries = item.retry_count ?? 0
    if (item.table_name === 'exercises') {
      const name = item.data?.name
      if (DEMO_EXERCISE_NAMES.has(name)) {
        await removeSyncItem(item.local_id)
      }
      continue
    }
    if (item.table_name === 'clubs') {
      if (item.data?.id === DEMO_CLUB_ID || item.data?.name === 'Демо-клуб') {
        await removeSyncItem(item.local_id)
      }
    }
  }
}

let flushTimer
let backgroundSyncPaused = false

/** На время входа не шлём очередь в Supabase (иначе 409 и «Загрузка…»). */
export function setBackgroundSyncPaused(paused) {
  backgroundSyncPaused = paused
}

/**
 * Выход из аккаунта: сначала попытка отправить очередь (если online), затем сброс оставшегося.
 * Чтобы другой пользователь на том же устройстве не отправил чужие записи.
 */
export async function clearSyncQueueForSignOut() {
  if (typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured()) {
    await flushSyncQueue({ force: true, maxMs: 12_000 })
  }
  const queue = await listSyncQueue()
  for (const item of queue) {
    await removeSyncItem(item.local_id)
  }
}

/** Убрать из очереди демо-insert в упражнения (старые версии приложения). */
export async function clearPoisonedSyncQueue() {
  const queue = await listSyncQueue()
  for (const item of queue) {
    if (item.table_name === 'exercises' && item.operation === 'insert' && DEMO_EXERCISE_NAMES.has(item.data?.name)) {
      await removeSyncItem(item.local_id)
    }
  }
}

const SYNC_QUEUE_RESET_KEY = 'fitness-diary-sync-reset-v5'

/** Один раз после обновления сайта — сброс всей очереди (убирает 409 в консоли). */
export async function resetSyncQueueOnceAfterDeploy() {
  if (!isSupabaseConfigured()) return
  try {
    if (localStorage.getItem(SYNC_QUEUE_RESET_KEY) === '1') return
    const queue = await listSyncQueue()
    for (const item of queue) {
      await removeSyncItem(item.local_id)
    }
    localStorage.setItem(SYNC_QUEUE_RESET_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** Не дергаем Supabase десятком POST подряд — одна очередь, один flush. */
export function scheduleFlushSyncQueue(opts = {}) {
  if (backgroundSyncPaused || !navigator.onLine || !isSupabaseConfigured()) return
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    void flushSyncQueue(opts)
  }, 1200)
}

/** Вставка уже есть на сервере (тот же id / unique) — очередь можно снять. */
export function isDuplicateInsertError(err) {
  if (!err) return false
  const status = err.status ?? err.statusCode ?? err?.context?.response?.status
  if (status === 409) return true
  const code = String(err.code ?? '')
  if (code === '23505' || code === 'PGRST116' || code === '409') return true
  const msg = String(err.message ?? '').toLowerCase()
  const details = String(err.details ?? '').toLowerCase()
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) return true
  if (msg.includes('already exists') || details.includes('already exists')) return true
  return msg.includes('409') || details.includes('duplicate')
}

/**
 * Отправка локальной очереди в Supabase (прямые insert/update/delete в целевые таблицы).
 * @param {{ maxMs?: number }} [opts] — общий лимит времени, чтобы не блокировать UI.
 */
export async function flushSyncQueue(opts = {}) {
  /* Без «Синхронизировать» в меню — не шлём ничего (старая очередь давала 409). */
  if (!opts.force) {
    await clearPoisonedSyncQueue()
    return { ok: false, reason: 'manual_only' }
  }
  if (backgroundSyncPaused && !opts.force) {
    return { ok: false, reason: 'paused' }
  }
  const maxMs = opts.maxMs ?? 25_000
  const result = await Promise.race([
    flushSyncQueueInner(),
    new Promise((resolve) => {
      setTimeout(() => resolve({ ok: false, reason: 'timeout' }), maxMs)
    }),
  ])
  return result
}

async function flushSyncQueueInner() {
  if (!isAppOnline() || !isSupabaseConfigured()) return { ok: false, reason: 'offline_or_stub' }

  await clearPoisonedSyncQueue()
  await pruneStaleSyncInserts({ aggressive: true })

  const queue = await listSyncQueue()
  for (const item of queue) {
    const table = item.table_name
    if (!table || !ALLOWED_TABLES.has(table)) {
      await removeSyncItem(item.local_id)
      continue
    }
    try {
      const pushedViaApi = await pushRecordViaApi({
        table_name: item.table_name,
        operation: item.operation,
        data: item.data,
        remote_id: item.remote_id,
        local_id: item.local_id,
      })
      if (pushedViaApi.ok) continue

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
        } else if (item.operation === 'insert' && isDuplicateInsertError(e)) {
          await removeSyncItem(item.local_id)
        } else {
          throw e
        }
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
  if (TRAINER_CACHE_STORES.has(storeName)) {
    invalidateTrainerWorkspaceCache()
    invalidateAdminClubWorkspaceCache()
  }
  const queueRow = await enqueueSync({
    table_name,
    operation,
    remote_id: remote_id === undefined ? record.id : remote_id,
    data: record,
  })
  /* Сначала push через Vercel API; при сбое остаётся в очереди для «Синхронизировать». */
  if (AUTO_PUSH_TABLES.has(table_name) && !backgroundSyncPaused && navigator.onLine) {
    schedulePushRecordViaApi({
      table_name,
      operation,
      remote_id: remote_id === undefined ? record.id : remote_id,
      data: record,
      local_id: queueRow.local_id,
    })
  }
}

export async function deleteLocalWithSync(storeName, key, table_name) {
  const db = await getDb()
  await db.delete(storeName, key)
  if (TRAINER_CACHE_STORES.has(storeName)) {
    invalidateTrainerWorkspaceCache()
    invalidateAdminClubWorkspaceCache()
  }
  const queueRow = await enqueueSync({
    table_name,
    operation: 'delete',
    remote_id: key,
    data: {},
  })
  if (AUTO_PUSH_TABLES.has(table_name) && !backgroundSyncPaused && navigator.onLine) {
    schedulePushRecordViaApi({
      table_name,
      operation: 'delete',
      remote_id: key,
      data: {},
      local_id: queueRow.local_id,
    })
  }
}

/** В IndexedDB ключ `client_id`, на сервере удаление по `id` записи медкарты. */
export async function deleteHealthCardByClientId(clientId) {
  const db = await getDb()
  const hc = await db.get('health_cards', clientId)
  if (!hc) return
  await db.delete('health_cards', clientId)
  const queueRow = await enqueueSync({
    table_name: 'health_cards',
    operation: 'delete',
    remote_id: hc.id ?? null,
    data: {},
  })
  if (!backgroundSyncPaused && navigator.onLine) {
    schedulePushRecordViaApi({
      table_name: 'health_cards',
      operation: 'delete',
      remote_id: hc.id ?? null,
      data: {},
      local_id: queueRow.local_id,
    })
  }
}
