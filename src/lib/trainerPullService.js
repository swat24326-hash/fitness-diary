/**
 * Подтягивание данных тренера с сервера в IndexedDB.
 */

import { isSupabaseConfigured } from './supabase'
import { isRetryableNetworkError } from './supabaseRetry'
import { normalizeBodyMeasurementRow } from './bodyMeasures'
import { buildPendingSyncKeysByTable, getDb, putStoreUnlessPendingSync, removeClientFromLocalCacheOnly } from './localDb'
import { fetchTrainerPullViaApi } from './syncApiClient'
import { purgeSyncQueueForMissingClients } from './syncQueueOrphans'
import { invalidateTrainerWorkspaceCache } from './trainerWorkspaceCache'

const LOCAL_DATA_CHANGED = 'fitness-diary-storage'

function notifyLocalDataChanged() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_DATA_CHANGED, { detail: {} }))
  } catch {
    /* ignore */
  }
}

async function pruneOrphanTrainerClients(trainerId, remoteClients) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return 0
  const remoteIds = new Set((remoteClients ?? []).map((c) => String(c.id)).filter(Boolean))
  const pending = await buildPendingSyncKeysByTable()
  const db = await getDb()
  let pruned = 0
  for (const c of await db.getAll('clients')) {
    if (String(c.trainer_id) !== tid) continue
    const id = String(c.id)
    if (remoteIds.has(id)) continue
    if (pending.clients.has(id)) continue
    await removeClientFromLocalCacheOnly(id)
    pruned++
  }
  return pruned
}

async function cacheTrainerPull(trainerId, { clients, memberships, health_cards, body_measurements, trainings }) {
  const pending = await buildPendingSyncKeysByTable()
  for (const row of clients ?? []) await putStoreUnlessPendingSync('clients', row, pending)
  for (const row of memberships ?? []) await putStoreUnlessPendingSync('memberships', row, pending)
  for (const row of health_cards ?? []) await putStoreUnlessPendingSync('health_cards', row, pending)
  for (const row of body_measurements ?? []) {
    await putStoreUnlessPendingSync('body_measurements', normalizeBodyMeasurementRow(row), pending)
  }
  for (const row of trainings ?? []) await putStoreUnlessPendingSync('trainings', row, pending)
  const pruned = await pruneOrphanTrainerClients(trainerId, clients)
  await purgeSyncQueueForMissingClients((clients ?? []).map((c) => c.id))
  invalidateTrainerWorkspaceCache()
  notifyLocalDataChanged()
  return pruned
}

/** @returns {Promise<{ ok: boolean, source?: string, count?: number, error?: string }>} */
export async function pullTrainerWorkspaceFromCloud(trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid || !isSupabaseConfigured()) return { ok: false, reason: 'no_trainer' }

  try {
    const viaApi = await fetchTrainerPullViaApi()
    if (viaApi) {
      const pruned = await cacheTrainerPull(tid, viaApi)
      return {
        ok: true,
        source: 'api',
        count: viaApi.clients.length,
        memberships: viaApi.memberships.length,
        body_measurements: viaApi.body_measurements?.length ?? 0,
        trainings: viaApi.trainings?.length ?? 0,
        pruned_clients: pruned,
      }
    }
  } catch (e) {
    if (!isRetryableNetworkError(e)) {
      return { ok: false, error: String(e?.message ?? e ?? 'Ошибка загрузки') }
    }
  }

  return { ok: false, error: 'Нет связи с сервером — показаны данные с устройства' }
}
