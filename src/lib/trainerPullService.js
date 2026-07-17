/**
 * Подтягивание данных тренера с сервера в IndexedDB.
 */

import { isSupabaseConfigured } from './supabase'
import { isRetryableNetworkError } from './supabaseRetry'
import { normalizeBodyMeasurementRow } from './bodyMeasures'
import { normalizeWeightEntryRow } from './clientWeightCore'
import {
  buildPendingSyncKeysByTable,
  getMeta,
  listSyncQueue,
  putStoreUnlessPendingSync,
  removeClientFromLocalCacheOnly,
  removeSyncItem,
  setMeta,
} from './localDb'
import { listClientsByTrainerId } from './localDbClubQuery'
import { fetchTrainerPullViaApi } from './syncApiClient'
import {
  resolveTrainerPullTrainingsSince,
  shouldForceFullTrainerPull,
} from './trainerPullIncremental'
import { pruneRedundantSyncQueue, purgeSyncQueueForMissingClients } from './syncQueueOrphans'
import { pruneLocalTrainingsForTrainer } from './idbRetention'
import { pruneOrphanTrainingsForTrainerClients } from './clientTrainingsCache'
import { invalidateTrainerWorkspaceCache } from './trainerWorkspaceCache'
import { cacheClubOutreachTemplates } from './trainer/trainerOutreachLogService'

const LOCAL_DATA_CHANGED = 'fitness-diary-storage'
const META_TRAINER_PULL_AT = 'trainer_pull_at'

function notifyLocalDataChanged() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_DATA_CHANGED, { detail: {} }))
  } catch {
    /* ignore */
  }
}

async function pruneOrphanTrainerClients(trainerId, remoteClients, opts = {}) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return 0
  const preserveArchived = opts?.preserveArchived === true
  const remoteIds = new Set((remoteClients ?? []).map((c) => String(c.id)).filter(Boolean))
  const pending = await buildPendingSyncKeysByTable()
  let pruned = 0
  for (const item of await listSyncQueue()) {
    if (item.table_name === 'clients' && item.operation === 'insert') {
      const id = String(item.data?.id ?? item.remote_id ?? '').trim()
      if (id && remoteIds.has(id)) {
        await removeSyncItem(item.local_id)
      }
    }
  }

  for (const c of await listClientsByTrainerId(tid)) {
    if (preserveArchived && c?.archived_at) continue
    const id = String(c.id)
    if (remoteIds.has(id)) continue
    if (pending.clients.has(id)) continue
    await removeClientFromLocalCacheOnly(id)
    pruned++
  }
  return pruned
}

async function cacheTrainerPull(
  trainerId,
  {
    clients,
    memberships,
    health_cards,
    body_measurements,
    client_weight_entries,
    trainings,
    pnk_funnel_events,
    club_id,
    outreach_templates,
  },
  opts = {},
) {
  const mode = String(opts?.mode ?? 'active')
  const preserveArchived = mode === 'active'
  const pending = await buildPendingSyncKeysByTable()
  for (const row of clients ?? []) await putStoreUnlessPendingSync('clients', row, pending)
  for (const row of memberships ?? []) await putStoreUnlessPendingSync('memberships', row, pending)
  for (const row of health_cards ?? []) await putStoreUnlessPendingSync('health_cards', row, pending)
  for (const row of body_measurements ?? []) {
    await putStoreUnlessPendingSync('body_measurements', normalizeBodyMeasurementRow(row), pending)
  }
  for (const row of client_weight_entries ?? []) {
    await putStoreUnlessPendingSync('client_weight_entries', normalizeWeightEntryRow(row), pending)
  }
  for (const row of trainings ?? []) await putStoreUnlessPendingSync('trainings', row, pending)
  for (const row of pnk_funnel_events ?? []) await putStoreUnlessPendingSync('pnk_funnel_events', row, pending)
  const pruned_trainings =
    mode === 'active' ? 0 : await pruneOrphanTrainingsForTrainerClients(clients, trainings, pending?.trainings ?? null)
  const pruned = await pruneOrphanTrainerClients(trainerId, clients, { preserveArchived })
  if (mode !== 'active') {
    await purgeSyncQueueForMissingClients((clients ?? []).map((c) => c.id))
  }
  await pruneRedundantSyncQueue()
  if (club_id && Object.prototype.hasOwnProperty.call({ outreach_templates }, 'outreach_templates')) {
    await cacheClubOutreachTemplates(club_id, outreach_templates ?? null)
  }
  invalidateTrainerWorkspaceCache()
  notifyLocalDataChanged()
  return { pruned, pruned_trainings }
}

async function fetchTrainerPullWithIncremental(tid, mode) {
  const useIncremental = mode === 'active'
  let fullPull = !useIncremental
  let trainingsSince = useIncremental
    ? resolveTrainerPullTrainingsSince({ lastPullAt: await getMeta(META_TRAINER_PULL_AT) })
    : null

  let viaApi = await fetchTrainerPullViaApi({
    includeArchived: mode === 'all',
    archivedOnly: mode === 'archive',
    trainingsSince: trainingsSince ?? undefined,
    fullPull,
  })

  if (viaApi && shouldForceFullTrainerPull(viaApi) && useIncremental && trainingsSince) {
    fullPull = true
    trainingsSince = null
    viaApi = await fetchTrainerPullViaApi({
      includeArchived: mode === 'all',
      archivedOnly: mode === 'archive',
      fullPull: true,
    })
  }

  return viaApi
}

/** @returns {Promise<{ ok: boolean, source?: string, count?: number, error?: string }>} */
export async function pullTrainerWorkspaceFromCloud(trainerId, opts = {}) {
  const tid = String(trainerId ?? '').trim()
  if (!tid || !isSupabaseConfigured()) return { ok: false, reason: 'no_trainer' }
  const mode = String(opts?.mode ?? 'active') // active | archive | all

  try {
    const viaApi = await fetchTrainerPullWithIncremental(tid, mode)
    if (viaApi) {
      const pruned = await cacheTrainerPull(tid, viaApi, { mode })
      if (mode === 'active') {
        await setMeta(META_TRAINER_PULL_AT, Date.now())
        const pending = await buildPendingSyncKeysByTable()
        await pruneLocalTrainingsForTrainer(tid, { pendingTrainingIds: pending?.trainings ?? new Set() })
      }
      return {
        ok: true,
        source: 'api',
        count: viaApi.clients.length,
        memberships: viaApi.memberships.length,
        body_measurements: viaApi.body_measurements?.length ?? 0,
        client_weight_entries: viaApi.client_weight_entries?.length ?? 0,
        trainings: viaApi.trainings?.length ?? 0,
        trainings_truncated: viaApi.trainings_truncated === true,
        incremental: viaApi.incremental === true,
        pruned_clients: pruned.pruned,
        pruned_trainings: pruned.pruned_trainings,
      }
    }
  } catch (e) {
    if (!isRetryableNetworkError(e)) {
      return { ok: false, error: String(e?.message ?? e ?? 'Ошибка загрузки') }
    }
  }

  return { ok: false, error: 'Нет связи с сервером — показаны данные с устройства' }
}
