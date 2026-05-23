/**
 * Справочник упражнений: локальный кэш (IDB), условный pull, кэш в памяти на сессию.
 */
import { isSupabaseConfigured } from './supabase'
import { getDb, putStore } from './localDb'
import { fetchExercisesViaApi, fetchExercisesMetaViaApi } from './admin/adminApiClient'
import { supabase } from './supabase'
import { withSupabaseRetry } from './supabaseRetry'
import { ADMIN_SYNC_BATCH_SIZE } from './admin/adminConstants'
const STORAGE_EVENT = 'fitness-diary-storage'

const META_KEY = 'exercises_sync'
/** Периодический pull при Sync, даже если count совпал (ловит правки без смены created_at). */
const EXERCISES_PULL_MAX_AGE_MS = 4 * 60 * 60 * 1000

/** @type {null | { rows: object[], loadedAt: number }} */
let memoryCache = null

export function invalidateExerciseCatalogCache() {
  memoryCache = null
}

function notifyExercisesChanged(detail = {}) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: { reason: 'exercises', ...detail } }))
  } catch {
    /* ignore */
  }
}

async function readSyncMeta() {
  const db = await getDb()
  const raw = await db.get('meta', META_KEY)
  if (!raw || typeof raw !== 'object') return null
  return raw
}

async function writeSyncMeta(patch) {
  const db = await getDb()
  const prev = (await readSyncMeta()) ?? {}
  await db.put('meta', { ...prev, ...patch, updated_at: new Date().toISOString() }, META_KEY)
}

/** После правки админом на этом устройстве — следующий pull не пропускать по meta. */
export async function markExercisesSyncMetaDirty() {
  await writeSyncMeta({ dirty: true })
  invalidateExerciseCatalogCache()
}

/** После успешного push с этого устройства — не делать лишний pull на следующем Sync. */
export async function refreshExercisesSyncMetaFromLocal() {
  const db = await getDb()
  const rows = await db.getAll('exercises')
  await writeSyncMeta({
    remote_count: rows.length,
    remote_max_created_at: maxCreatedAtFromRows(rows),
    synced_at: new Date().toISOString(),
    dirty: false,
  })
}

function remoteMetaMatches(localMeta, remote) {
  if (!localMeta || !remote) return false
  if (localMeta.dirty) return false
  return (
    Number(localMeta.remote_count) === Number(remote.count) &&
    String(localMeta.remote_max_created_at ?? '') === String(remote.max_created_at ?? '')
  )
}

async function shouldSkipPull(force) {
  if (force) return false
  if (!isSupabaseConfigured()) return true
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true

  const db = await getDb()
  const localRows = await db.getAll('exercises')
  if (!localRows.length) return false

  const meta = await readSyncMeta()
  if (meta?.dirty) return false

  const syncedAt = meta?.synced_at ? Date.parse(meta.synced_at) : 0
  if (syncedAt && Date.now() - syncedAt > EXERCISES_PULL_MAX_AGE_MS) return false

  const remote = await fetchExercisesMetaViaApi()
  if (!remote) return false

  if (remoteMetaMatches(meta, remote)) return true
  return false
}

async function applyRemoteMetaAfterPull(count, maxCreatedAt) {
  await writeSyncMeta({
    remote_count: count,
    remote_max_created_at: maxCreatedAt ?? null,
    synced_at: new Date().toISOString(),
    dirty: false,
  })
}

function maxCreatedAtFromRows(rows) {
  let max = ''
  for (const r of rows ?? []) {
    const t = String(r.created_at ?? '')
    if (t > max) max = t
  }
  return max || null
}

/**
 * @param {{ force?: boolean }} [opts] — force: кнопка «Обновить» в админке
 * @returns {Promise<{ ok: boolean, skipped?: boolean, count?: number, source?: string, error?: string, reason?: string }>}
 */
export async function pullExercisesFromCloud(opts = {}) {
  const force = opts.force === true
  if (!isSupabaseConfigured()) return { ok: false, reason: 'no_supabase' }

  if (await shouldSkipPull(force)) {
    const db = await getDb()
    const local = await db.getAll('exercises')
    return { ok: true, skipped: true, count: local.length, reason: 'cache_fresh' }
  }

  try {
    const viaApi = await fetchExercisesViaApi()
    if (viaApi) {
      for (const row of viaApi.exercises) {
        await putStore('exercises', row)
      }
      const maxCa = maxCreatedAtFromRows(viaApi.exercises) ?? viaApi.max_created_at ?? null
      await applyRemoteMetaAfterPull(viaApi.count ?? viaApi.exercises.length, maxCa)
      invalidateExerciseCatalogCache()
      notifyExercisesChanged({ source: 'pull' })
      return { ok: true, count: viaApi.count ?? viaApi.exercises.length, source: 'api' }
    }
  } catch (e) {
    const msg = String(e?.message ?? e ?? '')
    if (!/failed to fetch|connection reset|timeout/i.test(msg)) {
      return { ok: false, error: msg }
    }
  }

  try {
    let total = 0
    let from = 0
    const all = []
    for (;;) {
      const { data, error } = await withSupabaseRetry(() =>
        supabase
          .from('exercises')
          .select('*')
          .order('id', { ascending: true })
          .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1),
      )
      if (error) throw error
      const rows = data ?? []
      if (!rows.length) break
      for (const row of rows) {
        await putStore('exercises', row)
        all.push(row)
      }
      total += rows.length
      if (rows.length < ADMIN_SYNC_BATCH_SIZE) break
      from += ADMIN_SYNC_BATCH_SIZE
    }
    await applyRemoteMetaAfterPull(total, maxCreatedAtFromRows(all))
    invalidateExerciseCatalogCache()
    notifyExercisesChanged({ source: 'pull' })
    return { ok: true, count: total, source: 'browser' }
  } catch (e) {
    return { ok: false, error: e?.message ?? 'Ошибка загрузки упражнений' }
  }
}

/** Список из памяти → IDB; без сети. */
export async function listExercisesCached() {
  if (memoryCache?.rows) return memoryCache.rows
  const db = await getDb()
  const rows = await db.getAll('exercises')
  memoryCache = { rows, loadedAt: Date.now() }
  return rows
}

/** Подтянуть с сервера только если локальный справочник пуст (модалка челленджа и т.п.). */
export async function ensureExercisesCached() {
  const rows = await listExercisesCached()
  if (rows.length > 0) return { ok: true, count: rows.length, fromCache: true }
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { ok: true, count: 0, fromCache: true }
  }
  return pullExercisesFromCloud({ force: false })
}
