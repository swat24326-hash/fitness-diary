/**
 * Подтягивание данных тренера с сервера в IndexedDB.
 */

import { isSupabaseConfigured } from './supabase'
import { isRetryableNetworkError } from './supabaseRetry'
import { normalizeBodyMeasurementRow } from './bodyMeasures'
import { normalizeWeightEntryRow } from './clientWeightCore'
import {
  buildPendingSyncKeysByTable,
  deleteFromStore,
  getAllStore,
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
import {
  planTrainerOrphanClientPrune,
  shouldPruneTrainerPullSideEffects,
} from './trainerPullClientPruneCore'
import { planTrainerSaleClipsPrune } from './admin/saleClipPullPruneCore.js'

const LOCAL_DATA_CHANGED = 'fitness-diary-storage'
const META_TRAINER_PULL_AT = 'trainer_pull_at'

/** Очередь pull: active + archive не пишут в IDB параллельно (слабая сеть). */
let trainerPullChain = Promise.resolve()

function enqueueTrainerPull(task) {
  const run = trainerPullChain.then(task, task)
  trainerPullChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

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
  const mode = String(opts?.mode ?? 'active')
  const remoteIds = new Set((remoteClients ?? []).map((c) => String(c.id)).filter(Boolean))
  const pending = await buildPendingSyncKeysByTable()
  for (const item of await listSyncQueue()) {
    if (item.table_name === 'clients' && item.operation === 'insert') {
      const id = String(item.data?.id ?? item.remote_id ?? '').trim()
      if (id && remoteIds.has(id)) {
        await removeSyncItem(item.local_id)
      }
    }
  }

  const toPrune = planTrainerOrphanClientPrune(
    await listClientsByTrainerId(tid),
    remoteClients,
    pending.clients,
    { mode },
  )
  let pruned = 0
  for (const id of toPrune) {
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
    sale_clips,
    client_hall_lifecycle,
    club_id,
    outreach_templates,
  },
  opts = {},
) {
  const mode = String(opts?.mode ?? 'active')
  const skipTrainings = opts?.skipTrainings === true
  const side = shouldPruneTrainerPullSideEffects(mode, {
    trainingsTruncated: opts?.trainingsTruncated === true,
  })
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
  if (!skipTrainings) {
    for (const row of trainings ?? []) await putStoreUnlessPendingSync('trainings', row, pending)
  }
  for (const row of pnk_funnel_events ?? []) await putStoreUnlessPendingSync('pnk_funnel_events', row, pending)
  for (const row of sale_clips ?? []) await putStoreUnlessPendingSync('sale_clips', row, pending)
  try {
    const localClips = await getAllStore('sale_clips')
    const pruneIds = planTrainerSaleClipsPrune(localClips, sale_clips, trainerId, pending?.sale_clips)
    for (const id of pruneIds) await deleteFromStore('sale_clips', id)
  } catch {
    /* store ещё не создан */
  }
  for (const row of client_hall_lifecycle ?? []) {
    try {
      await putStoreUnlessPendingSync('client_hall_lifecycle', row, pending)
    } catch {
      /* store ещё не создан до reload */
    }
  }
  const pruned_trainings =
    !skipTrainings && side.pruneTrainings
      ? await pruneOrphanTrainingsForTrainerClients(clients, trainings, pending?.trainings ?? null, {
          truncated: opts?.trainingsTruncated === true,
        })
      : 0
  const pruned = await pruneOrphanTrainerClients(trainerId, clients, { mode })
  if (side.purgeSyncQueue) {
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

async function fetchTrainerPullWithIncremental(tid, mode, pullOpts = {}) {
  const useIncremental = mode === 'active'
  const skipTrainings = pullOpts?.skipTrainings === true
  let fullPull = !useIncremental
  let trainingsSince = useIncremental
    ? resolveTrainerPullTrainingsSince({ lastPullAt: await getMeta(META_TRAINER_PULL_AT) })
    : null

  let viaApi = await fetchTrainerPullViaApi({
    includeArchived: mode === 'all',
    archivedOnly: mode === 'archive',
    trainingsSince: trainingsSince ?? undefined,
    fullPull,
    skipTrainings,
  })

  if (viaApi && shouldForceFullTrainerPull(viaApi) && useIncremental && trainingsSince) {
    fullPull = true
    trainingsSince = null
    viaApi = await fetchTrainerPullViaApi({
      includeArchived: mode === 'all',
      archivedOnly: mode === 'archive',
      fullPull: true,
      skipTrainings,
    })
  }

  return viaApi
}

/** @returns {Promise<{ ok: boolean, source?: string, count?: number, error?: string }>} */
export async function pullTrainerWorkspaceFromCloud(trainerId, opts = {}) {
  const tid = String(trainerId ?? '').trim()
  if (!tid || !isSupabaseConfigured()) return { ok: false, reason: 'no_trainer' }
  const mode = String(opts?.mode ?? 'active') // active | archive | all

  return enqueueTrainerPull(async () => {
    try {
      const skipTrainings = opts?.skipTrainings === true
      const viaApi = await fetchTrainerPullWithIncremental(tid, mode, { skipTrainings })
      if (viaApi) {
        const pruned = await cacheTrainerPull(tid, viaApi, {
          mode,
          trainingsTruncated: viaApi.trainings_truncated === true,
          skipTrainings,
        })
        if (mode === 'active') {
          await setMeta(META_TRAINER_PULL_AT, Date.now())
          if (!skipTrainings) {
            const pending = await buildPendingSyncKeysByTable()
            await pruneLocalTrainingsForTrainer(tid, { pendingTrainingIds: pending?.trainings ?? new Set() })
          }
        }
        return {
          ok: true,
          source: 'api',
          count: viaApi.clients.length,
          memberships: viaApi.memberships.length,
          body_measurements: viaApi.body_measurements?.length ?? 0,
          client_weight_entries: viaApi.client_weight_entries?.length ?? 0,
          trainings: skipTrainings ? 0 : viaApi.trainings?.length ?? 0,
          trainings_skipped: skipTrainings,
          trainings_truncated: viaApi.trainings_truncated === true,
          incremental: viaApi.incremental === true,
          pruned_clients: pruned.pruned,
          pruned_trainings: pruned.pruned_trainings,
        }
      }
    } catch (e) {
      const msg = String(e?.message ?? e ?? 'Ошибка загрузки')
      if (/таймаут|timeout/i.test(msg)) {
        return { ok: false, error: msg }
      }
      if (!isRetryableNetworkError(e)) {
        return { ok: false, error: msg }
      }
    }

    try {
      const { getAccessTokenForAdminApi } = await import('./syncApiClient.js')
      const token = await getAccessTokenForAdminApi()
      if (!token) {
        return { ok: false, error: 'Сессия истекла — выйдите и войдите снова' }
      }
    } catch {
      /* fall through to network message */
    }

    return { ok: false, error: 'Нет связи с сервером — показаны данные с устройства' }
  })
}
