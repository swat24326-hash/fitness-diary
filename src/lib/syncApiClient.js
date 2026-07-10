import { isSupabaseConfigured } from './supabase'
import { noteAppNetworkResponse } from './networkReachability'
import { getAccessTokenForAdminApi } from './admin/adminApiClient'
import { removeSyncItem } from './localDb'
import { handlePushApiFailure, isUnrecoverablePushError } from './syncQueueOrphans'
import { markRecordSynced } from './syncLocalRecords'
import { mapWithConcurrency } from './syncConcurrency'

/** Меньшие пачки — иначе serverless (10–60 с) обрывает запрос, клиент уходит в медленный retry. */
export const PUSH_BATCH_SIZE = 12
export const PUSH_PARALLEL = 10

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export const PUSH_TABLES = new Set([
  'clients',
  'membership_types',
  'memberships',
  'trainings',
  'health_cards',
  'body_measurements',
  'challenges',
  'exercises',
])

const PUSH_RECORD_TIMEOUT_MS = 28_000
const PUSH_BATCH_TIMEOUT_MS = 52_000

import { clearSyncErrors, getRecentSyncErrors, recordSyncError } from './appErrorJournal'

export { clearSyncErrors, getRecentSyncErrors, recordSyncError }

async function fetchPushApi(url, init, timeoutMs) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    noteAppNetworkResponse(res)
    return res
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(`Таймаут ${Math.round(timeoutMs / 1000)} с — сервер не ответил`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

let pushTimer = null
/** @type {Array<{ table_name: string, operation: string, data: object, remote_id: string | null, local_id: string }>} */
const pushQueue = []

/**
 * Отправка одной записи на /api/push-record (обход ERR_CONNECTION_RESET в браузере).
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function pushRecordViaApi({ table_name, operation, data, remote_id, local_id }) {
  if (!PUSH_TABLES.has(table_name) || !isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase не настроен' }
  }

  let token
  try {
    token = await getAccessTokenForAdminApi()
  } catch {
    return { ok: false, error: 'Нет сессии — войдите снова' }
  }
  if (!token) return { ok: false, error: 'Нет токена авторизации' }

  let res
  try {
    res = await fetchPushApi(
      `${apiOrigin()}/api/push-record`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ table_name, operation, data, remote_id }),
      },
      PUSH_RECORD_TIMEOUT_MS,
    )
  } catch (e) {
    recordSyncError({ status: 0, error: e?.message ? String(e.message) : 'Сеть недоступна', table_name, operation, local_id })
    return { ok: false, error: e?.message ? String(e.message) : 'Сеть недоступна' }
  }

  const body = await parseJson(res)
  if (res.ok && body.ok !== false) {
    if (local_id) {
      try {
        await removeSyncItem(local_id)
      } catch {
        /* ignore */
      }
    } else if (body.duplicate) {
      const { pruneRedundantSyncQueue } = await import('./syncQueueOrphans')
      await pruneRedundantSyncQueue()
    }
    try {
      await markRecordSynced(table_name, data)
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      duplicate: !!body.duplicate,
      record: body.record && typeof body.record === 'object' ? body.record : undefined,
    }
  }
  const err = String(body.error || body.message || `HTTP ${res.status}`)
  if (res.status === 409 || body.duplicate === true) {
    if (local_id) {
      try {
        await removeSyncItem(local_id)
      } catch {
        /* ignore */
      }
    }
    try {
      await markRecordSynced(table_name, data)
    } catch {
      /* ignore */
    }
    return { ok: true, duplicate: true }
  }
  if (isUnrecoverablePushError(res.status, err)) {
    return handlePushApiFailure({
      status: res.status,
      error: err,
      local_id,
      item: { table_name, operation, data, remote_id },
    })
  }
  recordSyncError({ status: res.status, error: err, table_name, operation, local_id })
  return { ok: false, status: res.status, error: err }
}

/**
 * Пакетная отправка на /api/push-records.
 * @param {Array<{ table_name: string, operation: string, data: object, remote_id: string | null, local_id: string }>} items
 */
export async function pushRecordsBatchViaApi(items) {
  if (!items.length || !isSupabaseConfigured()) {
    return { ok: false, error: 'Пустой пакет или Supabase не настроен' }
  }

  let token
  try {
    token = await getAccessTokenForAdminApi()
  } catch {
    return { ok: false, error: 'Нет сессии — войдите снова' }
  }
  if (!token) return { ok: false, error: 'Нет токена авторизации' }

  const records = items.map((item) => ({
    table_name: item.table_name,
    operation: item.operation,
    data: item.data,
    remote_id: item.remote_id,
    local_id: item.local_id,
  }))

  let res
  try {
    res = await fetchPushApi(
      `${apiOrigin()}/api/push-records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ records }),
      },
      PUSH_BATCH_TIMEOUT_MS,
    )
  } catch (e) {
    const msg = e?.message ? String(e.message) : 'Сеть недоступна'
    for (const item of items) {
      recordSyncError({
        status: 0,
        error: msg,
        table_name: item.table_name,
        operation: item.operation,
        local_id: item.local_id,
      })
    }
    return {
      ok: false,
      error: msg,
      timedOut: /таймаут/i.test(msg),
      failed: items.map((item) => ({ item, result: { ok: false, error: msg } })),
    }
  }

  const body = await parseJson(res)
  if (!Array.isArray(body.results)) {
    const err = String(body.error || body.message || `HTTP ${res.status}`)
    for (const item of items) {
      recordSyncError({
        status: res.status,
        error: err,
        table_name: item.table_name,
        operation: item.operation,
        local_id: item.local_id,
      })
    }
    return { ok: false, status: res.status, error: err, failed: items.map((item) => ({ item, result: { ok: false, error: err } })) }
  }

  /** @type {Array<{ item: typeof items[0], result: { ok?: boolean, duplicate?: boolean, error?: string, status?: number } }>} */
  const perItem = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const row = body.results.find((r) => r.index === i) ?? body.results[i]
    if (!row) {
      perItem.push({ item, result: { ok: false, error: 'Нет ответа по записи' } })
      continue
    }
    if (row.ok) {
      if (item.local_id) {
        try {
          await removeSyncItem(item.local_id)
        } catch {
          /* ignore */
        }
      }
      try {
        await markRecordSynced(item.table_name, item.data)
      } catch {
        /* ignore */
      }
      perItem.push({ item, result: { ok: true, duplicate: !!row.duplicate } })
      continue
    }
    const err = String(row.error ?? 'Ошибка')
    if (row.status === 409 || row.duplicate === true) {
      if (item.local_id) {
        try {
          await removeSyncItem(item.local_id)
        } catch {
          /* ignore */
        }
      }
      try {
        await markRecordSynced(item.table_name, item.data)
      } catch {
        /* ignore */
      }
      perItem.push({ item, result: { ok: true, duplicate: true } })
      continue
    }
    if (isUnrecoverablePushError(row.status, err)) {
      const dropped = await handlePushApiFailure({
        status: row.status,
        error: err,
        local_id: item.local_id,
        item,
      })
      perItem.push({ item, result: dropped })
      continue
    }
    recordSyncError({
      status: row.status,
      error: err,
      table_name: item.table_name,
      operation: item.operation,
      local_id: item.local_id,
    })
    perItem.push({ item, result: { ok: false, status: row.status, error: err } })
  }

  const failed = perItem.filter((x) => !x.result.ok && !x.result.dropped)
  return { ok: failed.length === 0, results: perItem, failed }
}

/** Debounced push после saveLocalWithSync */
export function schedulePushRecordViaApi(item) {
  if (!PUSH_TABLES.has(item.table_name)) return
  pushQueue.push(item)
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void flushPushQueue()
  }, 400)
}

async function flushPushQueue() {
  const batch = pushQueue.splice(0, pushQueue.length)
  for (let i = 0; i < batch.length; i += PUSH_BATCH_SIZE) {
    const chunk = batch.slice(i, i + PUSH_BATCH_SIZE)
    const pushed = await pushRecordsBatchViaApi(chunk)
    if (pushed.ok || !pushed.failed?.length) continue
    await mapWithConcurrency(pushed.failed.map((x) => x.item), PUSH_PARALLEL, (item) => pushRecordViaApi(item))
  }
  try {
    const { scheduleBackgroundSyncDrain } = await import('./syncService.js')
    scheduleBackgroundSyncDrain()
  } catch {
    /* ignore */
  }
}

/** Pull тренера: клиенты + абонементы + health_cards */
export async function fetchTrainerPullViaApi(opts = {}) {
  if (!isSupabaseConfigured()) return null
  const includeArchived = opts?.includeArchived === true
  const archivedOnly = opts?.archivedOnly === true
  const skipTrainings = opts?.skipTrainings === true
  const trainingsSince = String(opts?.trainingsSince ?? '').slice(0, 10)
  const fullPull = opts?.fullPull === true

  let token
  try {
    token = await getAccessTokenForAdminApi()
  } catch {
    return null
  }
  if (!token) return null

  let res
  try {
    const qs = new URLSearchParams()
    if (includeArchived) qs.set('include_archived', '1')
    if (archivedOnly) qs.set('archived', '1')
    if (skipTrainings) qs.set('skip_trainings', '1')
    if (!fullPull && /^\d{4}-\d{2}-\d{2}$/.test(trainingsSince)) qs.set('trainings_since', trainingsSince)
    const url = `${apiOrigin()}/api/trainer-pull${qs.toString() ? `?${qs.toString()}` : ''}`
    res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    })
    noteAppNetworkResponse(res)
  } catch {
    return null
  }

  const ct = res.headers.get('content-type') || ''
  const data = await parseJson(res)
  if (!res.ok) return null
  if (ct.includes('text/html')) return null

  return {
    clients: Array.isArray(data.clients) ? data.clients : [],
    memberships: Array.isArray(data.memberships) ? data.memberships : [],
    health_cards: Array.isArray(data.health_cards) ? data.health_cards : [],
    body_measurements: Array.isArray(data.body_measurements) ? data.body_measurements : [],
    trainings: Array.isArray(data.trainings) ? data.trainings : [],
    trainings_truncated: data.trainings_truncated === true,
    trainings_since: data.trainings_since ?? null,
    incremental: data.incremental === true,
  }
}

export async function fetchHealthCardsForClubViaApi(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null

  let token
  try {
    token = await getAccessTokenForAdminApi()
  } catch {
    return null
  }
  if (!token) return null

  let res
  try {
    res = await fetch(`${apiOrigin()}/api/admin-data?action=health-cards&club_id=${encodeURIComponent(cid)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    return null
  }

  const data = await parseJson(res)
  if (!res.ok) return null
  return {
    health_cards: Array.isArray(data.health_cards) ? data.health_cards : [],
    body_measurements: Array.isArray(data.body_measurements) ? data.body_measurements : [],
    count: typeof data.count === 'number' ? data.count : 0,
  }
}
