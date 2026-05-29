import { isSupabaseConfigured } from './supabase'
import { initNetworkReachability, isAppOnline } from './networkReachability'
import { getDb, listSyncQueue, removeSyncItem, enqueueSync, setOnlineFlag } from './localDb'
import {
  pushRecordViaApi,
  pushRecordsBatchViaApi,
  PUSH_BATCH_SIZE,
  PUSH_PARALLEL,
  PUSH_TABLES,
  schedulePushRecordViaApi,
} from './syncApiClient'
import { mapWithConcurrency } from './syncConcurrency'
import {
  collapseDuplicateQueueInserts,
  collapseRedundantQueueItems,
  dropLocalOrphanForSyncItem,
  isUnrecoverablePushError,
  purgeSyncQueueAgainstLocalClients,
  pruneRedundantSyncQueue,
} from './syncQueueOrphans'
import { enqueueUnsyncedLocalRecords, recordForPush, countUnsyncedLocalRecords } from './syncLocalRecords'
import { reportSyncOutcome } from './appErrorJournal'
import { invalidateTrainerWorkspaceCache } from './trainerWorkspaceCache'
import { invalidateAdminClubWorkspaceCache } from './admin/adminClubWorkspaceCache'
import { isDuplicateInsertError } from './syncFlushResult'
import { reportQueueFlushProgress, setQueueFlushProgressReporter } from './syncProgress'

export { isDuplicateInsertError, describeFlushQueueResult } from './syncFlushResult'

const TRAINER_CACHE_STORES = new Set(['clients', 'memberships', 'trainings', 'health_cards', 'body_measurements'])

const AUTO_PUSH_TABLES = new Set([
  'clients',
  'membership_types',
  'memberships',
  'trainings',
  'health_cards',
  'body_measurements',
  'challenges',
  'exercises',
])

/** Порядок отправки: сначала сущности, от которых зависят остальные. */
const SYNC_TABLE_PRIORITY = {
  clients: 10,
  membership_types: 15,
  memberships: 20,
  trainings: 30,
  health_cards: 40,
  body_measurements: 50,
  challenges: 60,
  exercises: 70,
}

function syncQueueSortKey(item) {
  const op = item.operation
  const opRank = op === 'delete' ? 0 : op === 'insert' ? 1 : 2
  const tableRank = SYNC_TABLE_PRIORITY[item.table_name] ?? 99
  return opRank * 1000 + tableRank
}

export function initConnectivityListeners() {
  return initNetworkReachability((online) => {
    void setOnlineFlag(online)
    if (online) {
      scheduleFlushSyncQueue({ force: true, background: true })
      scheduleBackgroundSyncDrain()
    }
  })
}

export { isAppOnline }

const DEMO_EXERCISE_NAMES = new Set(['Приседания со штангой', 'Жим штанги лёжа'])
const DEMO_CLUB_ID = '00000000-0000-4000-8000-000000000010'

/**
 * Убирает из очереди «застрявшие» insert в exercises/clubs (демо и повторные 409).
 * @param {{ aggressive?: boolean }} [opts] — после входа: снять все insert в справочниках (сервер — источник правды).
 */
export async function pruneStaleSyncInserts(_opts = {}) {
  const queue = await listSyncQueue()
  for (const item of queue) {
    if (item.operation !== 'insert') continue
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
/** @type {Promise<{ ok: boolean, reason?: string, remaining?: number }> | null} */
let flushInFlightPromise = null

let backgroundDrainTimer = null
let backgroundIntervalId = null
let backgroundOnVis = null
let backgroundOnData = null
let backgroundDrainStarted = false

const BG_DRAIN_DEBOUNCE_MS = 2_500
const BG_DRAIN_INTERVAL_MS = 45_000

async function notifySyncQueueChanged() {
  try {
    const { dispatchLocalDataChanged } = await import('./dataAccess.js')
    dispatchLocalDataChanged({ reason: 'sync-queue' })
  } catch {
    /* ignore */
  }
}

export async function getPendingSyncQueueLength() {
  try {
    return (await listSyncQueue()).length
  } catch {
    return 0
  }
}

export { countUnsyncedLocalRecords } from './syncLocalRecords'

/** Очередь + записи только на устройстве (ещё не в sync_queue). */
export async function getSyncOutboundSummary() {
  const queue = await getPendingSyncQueueLength()
  const { total: localOnly } = await countUnsyncedLocalRecords()
  return { queue, localOnly, total: queue + localOnly }
}

export function getFlushInFlightPromise() {
  return flushInFlightPromise
}

/** На время входа не шлём очередь в Supabase (иначе 409 и «Загрузка…»). */
export function setBackgroundSyncPaused(paused) {
  backgroundSyncPaused = paused
  if (paused) {
    stopBackgroundSyncDrain()
    return
  }
  if (isAppOnline() && isSupabaseConfigured()) {
    startBackgroundSyncDrain()
    scheduleBackgroundSyncDrain(1_500)
  }
}

/**
 * Выход из аккаунта: сначала попытка отправить очередь (если online), затем сброс оставшегося.
 * Чтобы другой пользователь на том же устройстве не отправил чужие записи.
 */
export async function clearSyncQueueForSignOut() {
  if (isAppOnline() && isSupabaseConfigured()) {
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

const SYNC_QUEUE_RESET_KEY = 'fitness-diary-sync-reset-v6'

/** @deprecated Больше не сбрасываем очередь — enqueueUnsyncedLocalRecords восстанавливает synced:false. */
export async function resetSyncQueueOnceAfterDeploy() {
  if (!isSupabaseConfigured()) return
  try {
    localStorage.setItem(SYNC_QUEUE_RESET_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** Не дергаем Supabase десятком POST подряд — одна очередь, один flush. */
export function scheduleFlushSyncQueue(opts = {}) {
  if (backgroundSyncPaused || !isAppOnline() || !isSupabaseConfigured()) return
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    void flushSyncQueue({ ...opts, force: opts.force ?? true, background: opts.background ?? true })
  }, 800)
}

/** Фоновая догонка очереди без кнопки «Синхронизировать». */
export function scheduleBackgroundSyncDrain(delayMs = BG_DRAIN_DEBOUNCE_MS) {
  if (backgroundSyncPaused || !isAppOnline() || !isSupabaseConfigured()) return
  clearTimeout(backgroundDrainTimer)
  backgroundDrainTimer = setTimeout(() => {
    backgroundDrainTimer = null
    void drainSyncQueueInBackground()
  }, delayMs)
}

export function startBackgroundSyncDrain() {
  if (backgroundDrainStarted || typeof window === 'undefined') return
  backgroundDrainStarted = true

  backgroundOnVis = () => {
    if (document.visibilityState === 'visible') scheduleBackgroundSyncDrain(600)
  }
  document.addEventListener('visibilitychange', backgroundOnVis)

  backgroundOnData = () => scheduleBackgroundSyncDrain()
  window.addEventListener('fitness-diary-storage', backgroundOnData)

  backgroundIntervalId = window.setInterval(() => {
    void drainSyncQueueInBackground()
  }, BG_DRAIN_INTERVAL_MS)

  scheduleBackgroundSyncDrain(1200)
}

export function stopBackgroundSyncDrain() {
  backgroundDrainStarted = false
  clearTimeout(backgroundDrainTimer)
  backgroundDrainTimer = null
  if (backgroundIntervalId != null) {
    clearInterval(backgroundIntervalId)
    backgroundIntervalId = null
  }
  if (backgroundOnVis) {
    document.removeEventListener('visibilitychange', backgroundOnVis)
    backgroundOnVis = null
  }
  if (backgroundOnData) {
    window.removeEventListener('fitness-diary-storage', backgroundOnData)
    backgroundOnData = null
  }
}

export async function drainSyncQueueInBackground() {
  if (backgroundSyncPaused || !isAppOnline() || !isSupabaseConfigured()) return { ok: false, reason: 'skipped' }
  if (flushInFlightPromise) return { ok: false, reason: 'busy' }

  const pending = await getPendingSyncQueueLength()
  if (pending === 0) return { ok: true, remaining: 0 }

  const maxMs = Math.min(120_000, 22_000 + pending * 300)
  const result = await flushSyncQueue({ force: true, background: true, maxMs })

  void notifySyncQueueChanged()

  const left = result?.remaining ?? (await getPendingSyncQueueLength())
  if (left > 0 && result?.reason !== 'paused' && result?.reason !== 'offline_or_stub') {
    const retryMs = result?.reason === 'timeout' ? 10_000 : 5_000
    scheduleBackgroundSyncDrain(retryMs)
  }

  return result
}

/**
 * Отправка локальной очереди в Supabase (прямые insert/update/delete в целевые таблицы).
 * @param {{ maxMs?: number }} [opts] — общий лимит времени, чтобы не блокировать UI.
 */
async function defaultFlushMaxMs(force) {
  if (!force) return 25_000
  try {
    const qLen = (await listSyncQueue()).length
    return Math.min(180_000, 35_000 + qLen * 800)
  } catch {
    return 90_000
  }
}

async function flushUntilQueueDrained(maxPasses = 8) {
  let result = { ok: false, reason: 'pending_items', remaining: 1 }
  for (let pass = 0; pass < maxPasses; pass++) {
    if (pass > 0) {
      await collapseRedundantQueueItems()
      await collapseDuplicateQueueInserts()
      await pruneRedundantSyncQueue()
    }
    const before = await getPendingSyncQueueLength()
    result = await flushSyncQueueInner()
    if (result.ok) return result
    const after = result.remaining ?? (await getPendingSyncQueueLength())
    if (after === 0) return { ok: true, remaining: 0 }
    if (pass > 0 && after >= before) break
  }
  return result
}

async function reportFlushOutcomeToJournal(result, opts) {
  if (opts.waitUntilDone) return
  if (!opts.force && !opts.background) return
  const skipped = result?.reason === 'manual_only' || result?.reason === 'paused' || result?.reason === 'offline_or_stub'
  if (skipped) return

  let left = typeof result?.remaining === 'number' ? result.remaining : null
  if (left == null) {
    try {
      left = await getPendingSyncQueueLength()
    } catch {
      left = 0
    }
  }

  const queueFailed = left > 0 && result?.reason !== 'timeout'
  reportSyncOutcome({
    queueCount: left,
    hadError: queueFailed || (result?.ok === false && left === 0),
  })
}

export async function flushSyncQueue(opts = {}) {
  /* Без force/background — только очистка яда; отправка по кнопке или фону. */
  if (!opts.force && !opts.background) {
    await clearPoisonedSyncQueue()
    return { ok: false, reason: 'manual_only' }
  }
  if (backgroundSyncPaused && !opts.force) {
    return { ok: false, reason: 'paused' }
  }

  if (opts.onProgress) setQueueFlushProgressReporter(opts.onProgress)
  try {
    if (opts.waitUntilDone) {
      const result = await flushUntilQueueDrained(8)
      void notifySyncQueueChanged()
      return result
    }

    const maxMs = opts.maxMs ?? (await defaultFlushMaxMs(opts.force || opts.background))
    const work = flushSyncQueueInner()
    let result = await Promise.race([
      work,
      new Promise((resolve) => {
        setTimeout(() => resolve({ ok: false, reason: 'timeout' }), maxMs)
      }),
    ])
    if (result?.reason === 'timeout') {
      try {
        const remaining = (await listSyncQueue()).length
        result = {
          ok: false,
          reason: 'timeout',
          remaining,
          stillRunning: flushInFlightPromise != null,
        }
      } catch {
        /* ignore */
      }
    }
    if (!result?.ok && (opts.background || opts.force)) {
      void notifySyncQueueChanged()
    }
    await reportFlushOutcomeToJournal(result, opts)
    return result
  } finally {
    if (opts.onProgress) setQueueFlushProgressReporter(null)
  }
}

async function flushSyncQueueInner() {
  if (!isAppOnline() || !isSupabaseConfigured()) return { ok: false, reason: 'offline_or_stub' }
  if (flushInFlightPromise) return flushInFlightPromise

  flushInFlightPromise = (async () => {
    try {
      return await flushSyncQueueInnerWork()
    } finally {
      flushInFlightPromise = null
    }
  })()

  return flushInFlightPromise
}

async function processOneSyncQueueItem(item) {
  const table = item.table_name
  if (!table || !PUSH_TABLES.has(table)) {
    await removeSyncItem(item.local_id)
    return { ok: true }
  }

  if ((item.operation === 'update' || item.operation === 'delete') && !item.remote_id) {
    await removeSyncItem(item.local_id)
    return { ok: true }
  }

  let payload = item.data
  if (
    table === 'health_cards' &&
    payload &&
    typeof payload === 'object' &&
    Object.prototype.hasOwnProperty.call(payload, 'goal')
  ) {
    const { goal: _g, ...rest } = payload
    payload = rest
  }

  const pushedViaApi = await pushRecordViaApi({
    table_name: item.table_name,
    operation: item.operation,
    data: payload,
    remote_id: item.remote_id,
    local_id: item.local_id,
  })
  if (pushedViaApi.ok || pushedViaApi.dropped) return { ok: true }
  if (isUnrecoverablePushError(pushedViaApi.status, pushedViaApi.error)) {
    await removeSyncItem(item.local_id)
    await dropLocalOrphanForSyncItem(item)
    return { ok: true }
  }

  const err = String(pushedViaApi.error ?? 'Ошибка отправки')
  if (item.operation === 'insert' && isDuplicateInsertError({ message: err, status: pushedViaApi.status })) {
    await removeSyncItem(item.local_id)
    return { ok: true }
  }

  throw new Error(err)
}

async function bumpSyncItemRetry(item) {
  const db = await getDb()
  const next = { ...item, retry_count: (item.retry_count ?? 0) + 1 }
  await db.put('sync_queue', next)
}

async function flushSyncQueueInnerWork() {
  await clearPoisonedSyncQueue()
  await pruneStaleSyncInserts({ aggressive: true })
  await purgeSyncQueueAgainstLocalClients()
  await collapseRedundantQueueItems()
  await collapseDuplicateQueueInserts()
  await pruneRedundantSyncQueue()
  const requeued = await enqueueUnsyncedLocalRecords()

  let queue = await listSyncQueue()
  const total = queue.length
  reportQueueFlushProgress(0, total, requeued > 0 ? `В очередь: +${requeued}…` : total > 0 ? 'Подготовка…' : 'Очередь пуста')
  if (total === 0) {
    return { ok: true, remaining: 0, requeued }
  }

  let processed = 0
  let pruned = 0
  const reportStep = (label) => {
    const done = Math.min(processed + pruned, total)
    const text =
      label ??
      (pruned > 0 && processed === 0
        ? `Подготовка… (убрано ${pruned})`
        : total > 0
          ? `Запись ${done} из ${total}`
          : 'Отправка…')
    reportQueueFlushProgress(done, total, text)
  }

  const validQueue = []
  for (const item of queue) {
    const table = item.table_name
    if (!table || !PUSH_TABLES.has(table)) {
      await removeSyncItem(item.local_id)
      pruned++
      continue
    }
    validQueue.push(item)
  }
  validQueue.sort((a, b) => syncQueueSortKey(a) - syncQueueSortKey(b))
  reportStep()

  const runChunkFallback = async (items) => {
    await mapWithConcurrency(items, PUSH_PARALLEL, async (item) => {
      try {
        await processOneSyncQueueItem(item)
      } catch {
        await bumpSyncItemRetry(item)
      } finally {
        processed++
        reportStep()
      }
    })
  }

  for (let offset = 0; offset < validQueue.length; offset += PUSH_BATCH_SIZE) {
    const chunk = validQueue.slice(offset, offset + PUSH_BATCH_SIZE)
    reportStep(`Пачка ${Math.floor(offset / PUSH_BATCH_SIZE) + 1}…`)

    let batchResult = await pushRecordsBatchViaApi(chunk)

    if (!batchResult.results && chunk.length > 2) {
      const half = Math.ceil(chunk.length / 2)
      const left = chunk.slice(0, half)
      const right = chunk.slice(half)
      reportStep(`Повтор меньшими частями…`)
      const r1 = await pushRecordsBatchViaApi(left)
      const r2 = await pushRecordsBatchViaApi(right)
      const mergedFailed = [...(r1.failed ?? []), ...(r2.failed ?? [])]
      const mergedOk = (r1.results || r2.results) && mergedFailed.length === 0
      batchResult = {
        ok: mergedOk,
        results: [...(r1.results ?? []), ...(r2.results ?? [])],
        failed: mergedFailed.length ? mergedFailed : undefined,
      }
    }

    if (!batchResult.results) {
      await runChunkFallback(chunk)
      continue
    }

    const retryItems = batchResult.failed?.map((x) => x.item) ?? []
    processed += chunk.length - retryItems.length
    reportStep()

    if (retryItems.length) {
      await runChunkFallback(retryItems)
    }
  }

  await pruneRedundantSyncQueue()
  const remaining = (await listSyncQueue()).length
  return remaining === 0
    ? { ok: true, remaining: 0, requeued }
    : { ok: false, reason: 'pending_items', remaining, requeued }
}

export async function saveLocalWithSync(storeName, record, { table_name, operation, remote_id }) {
  const db = await getDb()
  const remoteId = remote_id === undefined ? record.id : remote_id
  const row = {
    ...record,
    synced: false,
    __sync: { operation, remote_id: remoteId },
  }
  const payload = recordForPush(row)
  await db.put(storeName, row)
  if (TRAINER_CACHE_STORES.has(storeName)) {
    invalidateTrainerWorkspaceCache()
    invalidateAdminClubWorkspaceCache()
  }
  const queueRow = await enqueueSync({
    table_name,
    operation,
    remote_id: remoteId,
    data: payload,
  })
  /* Сначала push через Vercel API; при сбое остаётся в очереди для «Синхронизировать». */
  if (AUTO_PUSH_TABLES.has(table_name) && !backgroundSyncPaused && isAppOnline()) {
    schedulePushRecordViaApi({
      table_name,
      operation,
      remote_id: remoteId,
      data: payload,
      local_id: queueRow.local_id,
    })
    scheduleBackgroundSyncDrain()
  }
  return queueRow.local_id
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
  if (AUTO_PUSH_TABLES.has(table_name) && !backgroundSyncPaused && isAppOnline()) {
    schedulePushRecordViaApi({
      table_name,
      operation: 'delete',
      remote_id: key,
      data: {},
      local_id: queueRow.local_id,
    })
    scheduleBackgroundSyncDrain()
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
  if (!backgroundSyncPaused && isAppOnline()) {
    schedulePushRecordViaApi({
      table_name: 'health_cards',
      operation: 'delete',
      remote_id: hc.id ?? null,
      data: {},
      local_id: queueRow.local_id,
    })
    scheduleBackgroundSyncDrain()
  }
}
