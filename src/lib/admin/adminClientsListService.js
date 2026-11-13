/**
 * Список клиентов для админки: по клубу (Supabase / IndexedDB).
 * Без club_id в облаке не выполняем неограниченный select.
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { isRetryableNetworkError } from '../supabaseRetry'
import {
  buildPendingSyncKeysByTable,
  getDb,
  getMeta,
  putStoreUnlessPendingSync,
  removeClientFromLocalCacheOnly,
  setMeta,
} from '../localDb'
import { invalidateAdminClubWorkspaceCache } from './adminClubWorkspaceCache'
import { notifyAdminClientsBrowseStorageChanged } from './adminClientsListReloadCore.js'
import { fetchClientsForClubViaAdminApi, fetchMembershipsForClubViaAdminApi } from './adminApiClient'
import { mergeClientHallLifecycleIntoCache } from './clientHallLifecycleAdminCache.js'
import { purgeSyncQueueForMissingClients } from '../syncQueueOrphans'
import { listClientsByClubId, listTrainingsByClubIdInRange } from '../localDbClubQuery.js'
import {
  pruneOrphanMembershipsByRemoteIds,
  pruneOrphanMembershipsForClients,
} from '../clientMembershipsCache'
import { ADMIN_CLIENTS_REMOTE_LIMIT, ADMIN_SYNC_BATCH_SIZE } from './adminConstants'
import {
  adminClientsDeltaPrunePlan,
  adminClientsPullWatermarkKey,
  nextAdminClientsWatermark,
  remoteClientsForReconcile,
  shouldUseAdminClientsDelta,
} from './adminClientsDeltaCore.js'

async function readAdminClientsWatermark(clubId) {
  try {
    return await getMeta(adminClientsPullWatermarkKey(clubId))
  } catch {
    return null
  }
}

async function writeAdminClientsWatermark(clubId, serverTime, previous) {
  const next = nextAdminClientsWatermark({ ok: true, serverTime, previous })
  if (!next) return
  try {
    await setMeta(adminClientsPullWatermarkKey(clubId), next)
  } catch {
    /* IDB */
  }
}

async function pullClientsForClubIntoCache(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { ok: false, reason: 'no_club' }
  let total = 0
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('club_id', cid)
      .order('name', { ascending: true })
      .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1)
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) break
    const pending = await buildPendingSyncKeysByTable()
    for (const row of rows) {
      await putStoreUnlessPendingSync('clients', row, pending)
    }
    total += rows.length
    if (rows.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return { ok: true, count: total }
}

async function mergeClientsIntoCache(rows) {
  const pending = await buildPendingSyncKeysByTable()
  for (const row of rows) {
    await putStoreUnlessPendingSync('clients', row, pending)
  }
}

/**
 * Удаляет из IndexedDB клиентов клуба и «висячие» тренировки, которых нет в облаке
 * (иначе после удаления тренером админ видит черновики из старого кэша).
 */
export async function reconcileAdminClubCache(clubId, remoteClients, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { pruned_clients: 0, pruned_trainings: 0 }

  const remoteIds = new Set((remoteClients ?? []).map((c) => String(c.id)).filter(Boolean))
  const preserveArchived = opts?.preserveArchived === true
  const pending = await buildPendingSyncKeysByTable()
  const db = await getDb()
  let pruned_clients = 0
  let pruned_trainings = 0

  const clubClients = await listClientsByClubId(cid)
  for (const c of clubClients) {
    if (preserveArchived && c?.archived_at) continue
    const id = String(c.id)
    if (remoteIds.has(id)) continue
    if (pending.clients.has(id)) continue
    await removeClientFromLocalCacheOnly(id)
    pruned_clients++
  }

  const clubTrainings = await listTrainingsByClubIdInRange(cid, '1970-01-01', '2999-12-31')
  for (const t of clubTrainings) {
    const clientId = String(t.client_id ?? '')
    if (!clientId) continue
    if (remoteIds.has(clientId)) continue
    if (pending.trainings.has(String(t.id))) continue
    await db.delete('trainings', t.id)
    pruned_trainings++
  }

  if (pruned_clients > 0 || pruned_trainings > 0) {
    invalidateAdminClubWorkspaceCache()
  }

  if (!preserveArchived) {
    await purgeSyncQueueForMissingClients((remoteClients ?? []).map((c) => c.id))
  }

  return { pruned_clients, pruned_trainings }
}

async function mergeMembershipsIntoCache(rows) {
  const pending = await buildPendingSyncKeysByTable()
  for (const row of rows ?? []) {
    await putStoreUnlessPendingSync('memberships', row, pending)
  }
  return pending
}

/**
 * Абоны + lifecycle из list-memberships.
 * Prune только при !truncated; на дельте — только если есть membership_ids.
 * @param {object|null} viaMem
 * @param {string} clubId
 * @param {{ isDelta?: boolean }} [opts]
 */
async function mergeMembershipsAndLifecycleFromApi(viaMem, clubId, opts = {}) {
  if (!viaMem) return
  const isDelta = opts.isDelta === true
  const pending = Array.isArray(viaMem.memberships)
    ? await mergeMembershipsIntoCache(viaMem.memberships)
    : await buildPendingSyncKeysByTable()
  if (viaMem.client_hall_lifecycle?.length) {
    await mergeClientHallLifecycleIntoCache(viaMem.client_hall_lifecycle)
  }
  if (viaMem.client_az_instructors?.length) {
    const { mergeClientAzInstructorsIntoCache } = await import('./clientAzInstructorsCache.js')
    await mergeClientAzInstructorsIntoCache(viaMem.client_az_instructors)
  }
  const cid = String(clubId ?? '').trim()
  const plan = adminClientsDeltaPrunePlan({
    truncated: viaMem.truncated === true,
    membershipIds: viaMem.membership_ids,
    isDelta,
  })
  if (!cid || !plan.pruneMemberships) {
    /* Дельта без membership_ids: merge только, prune абонов пропускаем. */
    if (!isDelta && viaMem.truncated !== true && !Array.isArray(viaMem.membership_ids)) {
      try {
        const clients = await listClientsByClubId(cid)
        await pruneOrphanMembershipsForClients(
          clients,
          viaMem.memberships ?? [],
          pending?.memberships ?? null,
          { truncated: false },
        )
      } catch {
        /* IDB / индекс */
      }
    }
    return
  }
  try {
    const clients = Array.isArray(viaMem.client_ids)
      ? viaMem.client_ids
      : await listClientsByClubId(cid)
    await pruneOrphanMembershipsByRemoteIds(
      clients,
      plan.membershipIdsForPrune,
      pending?.memberships ?? null,
      { truncated: false },
    )
  } catch {
    /* IDB / индекс */
  }
}

/**
 * Активные + архивные с сервера в один снимок — иначе reconcile после active-pull
 * удаляет клиентов, которых тренер уже убрал в архив (локально archived_at ещё null).
 * @param {string} clubId
 * @param {{ updatedSince?: string }} [opts]
 */
async function mergeActiveAndArchiveClientsFromApi(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null
  const updatedSince = String(opts?.updatedSince ?? '').trim()
  const fetchOpts = updatedSince ? { updatedSince } : {}

  const [activeVia, archiveVia] = await Promise.all([
    fetchClientsForClubViaAdminApi(cid, { mode: 'active', ...fetchOpts }),
    fetchClientsForClubViaAdminApi(cid, { mode: 'archive', ...fetchOpts }),
  ])
  if (!activeVia && !archiveVia) return null

  const activeClients = activeVia?.clients ?? []
  const archiveClients = archiveVia?.clients ?? []

  await mergeClientsIntoCache(activeClients)
  await mergeClientsIntoCache(archiveClients)

  const combined = [...activeClients, ...archiveClients]
  const truncated = Boolean(activeVia?.truncated || archiveVia?.truncated)
  const clientIds =
    Array.isArray(activeVia?.client_ids) || Array.isArray(archiveVia?.client_ids)
      ? [...new Set([...(activeVia?.client_ids ?? []), ...(archiveVia?.client_ids ?? [])])]
      : null
  const plan = adminClientsDeltaPrunePlan({ truncated, clientIds, isDelta: Boolean(updatedSince) })
  let pruned = { pruned_clients: 0, pruned_trainings: 0 }
  if (plan.pruneClients) {
    pruned = await reconcileAdminClubCache(cid, remoteClientsForReconcile(plan.clientIdsForPrune, combined), {
      preserveArchived: true,
    })
  } else if (!updatedSince && !truncated) {
    pruned = await reconcileAdminClubCache(cid, combined, { preserveArchived: true })
  }

  const server_time = activeVia?.server_time || archiveVia?.server_time || null

  return {
    activeClients,
    archiveClients,
    combined,
    pruned,
    activeCount: activeClients.length,
    archiveCount: archiveClients.length,
    truncated,
    server_time,
    source: 'admin_api',
  }
}

/**
 * Pull клиентов + абонов клуба с опциональной дельтой по watermark.
 * @param {string} clubId
 * @param {{ mode?: string }} [opts]
 */
async function pullClubClientsAndMembershipsViaApi(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null
  const mode = String(opts?.mode ?? 'active')
  const previous = await readAdminClientsWatermark(cid)
  const useDelta = shouldUseAdminClientsDelta(previous)
  const updatedSince = useDelta ? String(previous).trim() : ''

  if (mode === 'active') {
    const merged = await mergeActiveAndArchiveClientsFromApi(cid, updatedSince ? { updatedSince } : {})
    if (!merged) return null
    try {
      const viaMem = await fetchMembershipsForClubViaAdminApi(
        cid,
        updatedSince ? { updatedSince } : {},
      )
      await mergeMembershipsAndLifecycleFromApi(viaMem, cid, { isDelta: Boolean(updatedSince) })
      const stamp = viaMem?.server_time || merged.server_time
      /* Watermark только если оба ответа не truncated — иначе хвост потеряем. */
      if (stamp && merged.truncated !== true && viaMem?.truncated !== true) {
        await writeAdminClientsWatermark(cid, stamp, previous)
      }
    } catch (memErr) {
      console.warn('[admin] list-memberships', memErr)
      /* Без успешного memberships watermark не двигаем — иначе пропустим дельту абонов. */
    }
    return merged
  }

  const viaApi = await fetchClientsForClubViaAdminApi(cid, {
    mode,
    ...(updatedSince ? { updatedSince } : {}),
  })
  if (!viaApi) return null
  await mergeClientsIntoCache(viaApi.clients)
  try {
    const viaMem = await fetchMembershipsForClubViaAdminApi(
      cid,
      updatedSince ? { updatedSince } : {},
    )
    await mergeMembershipsAndLifecycleFromApi(viaMem, cid, { isDelta: Boolean(updatedSince) })
    const stamp = viaMem?.server_time || viaApi.server_time
    if (stamp && viaApi.truncated !== true && viaMem?.truncated !== true) {
      await writeAdminClientsWatermark(cid, stamp, previous)
    }
  } catch (memErr) {
    console.warn('[admin] list-memberships', memErr)
  }
  const plan = adminClientsDeltaPrunePlan({
    truncated: viaApi.truncated === true,
    clientIds: viaApi.client_ids,
    isDelta: Boolean(updatedSince),
  })
  let pruned = { pruned_clients: 0, pruned_trainings: 0 }
  if (mode === 'all') {
    if (plan.pruneClients) {
      pruned = await reconcileAdminClubCache(
        cid,
        remoteClientsForReconcile(plan.clientIdsForPrune, viaApi.clients),
        { preserveArchived: true },
      )
    } else if (!updatedSince && viaApi.truncated !== true) {
      pruned = await reconcileAdminClubCache(cid, viaApi.clients, { preserveArchived: true })
    }
  }
  return {
    ...viaApi,
    pruned,
    activeCount: viaApi.count,
    archiveCount: 0,
    source: 'admin_api',
  }
}

/** Один раз после пакета merge — иначе админка перезагружается 3–4 раза подряд. */
function notifyAdminClientsCacheUpdated(clubId) {
  const cid = String(clubId ?? '').trim()
  notifyAdminClientsBrowseStorageChanged({
    reason: 'admin-clients-cache',
    ...(cid ? { clubId: cid } : {}),
  })
}

/** Подтянуть клиентов клуба из облака в IndexedDB (сначала API на Vercel). */
export async function pullAdminClientsFromCloud(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured()) return { ok: false, reason: 'no_club' }
  const mode = String(opts?.mode ?? 'active') // active | archive | all

  const merged = await pullClubClientsAndMembershipsViaApi(cid, { mode })
  if (merged) {
    notifyAdminClientsCacheUpdated(cid)
    const { clients } = await listAdminClientsFromLocalCache(cid)
    return {
      ok: true,
      count: merged.activeCount ?? merged.count ?? clients.length,
      archiveCount: merged.archiveCount ?? 0,
      source: 'admin_api',
      clients,
      pruned_clients: merged.pruned?.pruned_clients ?? 0,
      pruned_trainings: merged.pruned?.pruned_trainings ?? 0,
    }
  }

  /* Старый деплой / нет маршрута — аварийный прямой select (без delta). */
  const pulled = await pullClientsForClubIntoCache(cid)
  if (pulled.ok) {
    const { clients } = await listAdminClientsFromLocalCache(cid)
    const pruned = await reconcileAdminClubCache(cid, clients)
    notifyAdminClientsCacheUpdated(cid)
    return { ...pulled, pruned_clients: pruned.pruned_clients, pruned_trainings: pruned.pruned_trainings }
  }
  return pulled
}

function formatRemoteError(e) {
  const msg = String(e?.message ?? e ?? '')
  const code = String(e?.code ?? '')
  if (isRetryableNetworkError(e)) {
    return (
      'Нет связи с сервером приложения. Показаны данные с устройства. ' +
      'Проверьте интернет и обновите страницу (Ctrl+F5). Прямой доступ к Supabase из браузера не используется.'
    )
  }
  if (code === 'PGRST205' || /could not find the table|relation.*does not exist|schema cache/i.test(msg)) {
    return 'В Supabase нет таблицы clients — выполните supabase/schema.sql и supabase/policies.sql в SQL Editor.'
  }
  if (/404/.test(msg)) {
    return 'Supabase: ресурс не найден (404). Проверьте миграции и что проект hrylzinyasucjecltxpc — тот же, что в Vercel.'
  }
  return msg || 'Сервер недоступен'
}

async function listAdminClientsFromLocalCache(clubId) {
  let all = await listClientsByClubId(clubId)
  all.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
  const truncated = all.length >= ADMIN_CLIENTS_REMOTE_LIMIT
  const clients = truncated ? all.slice(0, ADMIN_CLIENTS_REMOTE_LIMIT) : all
  return { clients, truncated }
}

/**
 * Быстрый кадр списка из IndexedDB (без облака) — для «назад» с карточки.
 * @param {string} clubId
 */
export async function peekAdminClientsListLocal(clubId) {
  const id = String(clubId ?? '').trim()
  if (!id) return { clients: [], truncated: false }
  return listAdminClientsFromLocalCache(id)
}

/**
 * @param {{ clubId?: string }} p
 * @returns {Promise<{ clients: object[], source: string, fallbackReason: string | null, cloudNeedsClub?: boolean, truncated?: boolean }>}
 */
export async function listAdminClientsForClub(p) {
  const clubId = String(p?.clubId ?? '').trim()

  if (!isSupabaseConfigured()) {
    let all = await listClientsByClubId(clubId)
    all.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
    return { clients: all, source: 'local', fallbackReason: null, truncated: false }
  }

  if (!clubId) {
    return { clients: [], source: 'remote', fallbackReason: null, cloudNeedsClub: true, truncated: false }
  }

  try {
    try {
      const merged = await pullClubClientsAndMembershipsViaApi(clubId, { mode: 'active' })
      if (merged) {
        const { clients, truncated } = await listAdminClientsFromLocalCache(clubId)
        return {
          clients,
          source: 'admin_api',
          fallbackReason: null,
          truncated: truncated || merged.truncated === true,
        }
      }
    } catch (apiErr) {
      if (!isRetryableNetworkError(apiErr)) {
        throw apiErr
      }
      const { clients, truncated } = await listAdminClientsFromLocalCache(clubId)
      return {
        clients,
        source: 'local',
        fallbackReason: formatRemoteError(apiErr),
        truncated,
      }
    }

    /* Старый деплой без /api/list-clients — один раз через браузер (может не работать из РФ/VPN). */
    const pulled = await pullClientsForClubIntoCache(clubId)
    if (!pulled.ok) {
      const { clients, truncated } = await listAdminClientsFromLocalCache(clubId)
      return {
        clients,
        source: 'local',
        fallbackReason: pulled.error ? formatRemoteError(new Error(pulled.error)) : null,
        truncated,
      }
    }

    const { clients, truncated } = await listAdminClientsFromLocalCache(clubId)
    return {
      clients,
      source: 'remote',
      fallbackReason: null,
      truncated,
    }
  } catch (e) {
    const { clients, truncated } = await listAdminClientsFromLocalCache(clubId)
    return {
      clients,
      source: 'local',
      fallbackReason: formatRemoteError(e),
      truncated,
    }
  }
}
