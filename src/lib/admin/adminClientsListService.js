/**
 * Список клиентов для админки: по клубу (Supabase / IndexedDB).
 * Без club_id в облаке не выполняем неограниченный select.
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { isRetryableNetworkError } from '../supabaseRetry'
import {
  buildPendingSyncKeysByTable,
  getDb,
  putStoreUnlessPendingSync,
  removeClientFromLocalCacheOnly,
} from '../localDb'
import { invalidateAdminClubWorkspaceCache } from './adminClubWorkspaceCache'
import { notifyAdminClientsBrowseStorageChanged } from './adminClientsListReloadCore.js'
import { fetchClientsForClubViaAdminApi, fetchMembershipsForClubViaAdminApi } from './adminApiClient'
import { mergeClientHallLifecycleIntoCache } from './clientHallLifecycleAdminCache.js'
import { purgeSyncQueueForMissingClients } from '../syncQueueOrphans'
import { listClientsByClubId, listTrainingsByClubIdInRange } from '../localDbClubQuery.js'
import { ADMIN_CLIENTS_REMOTE_LIMIT, ADMIN_SYNC_BATCH_SIZE } from './adminConstants'

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
  for (const row of rows) {
    await putStoreUnlessPendingSync('memberships', row, pending)
  }
}

/** Абоны + lifecycle из одного list-memberships. */
async function mergeMembershipsAndLifecycleFromApi(viaMem) {
  if (!viaMem) return
  if (viaMem.memberships?.length) {
    await mergeMembershipsIntoCache(viaMem.memberships)
  }
  if (viaMem.client_hall_lifecycle?.length) {
    await mergeClientHallLifecycleIntoCache(viaMem.client_hall_lifecycle)
  }
}

/**
 * Активные + архивные с сервера в один снимок — иначе reconcile после active-pull
 * удаляет клиентов, которых тренер уже убрал в архив (локально archived_at ещё null).
 */
async function mergeActiveAndArchiveClientsFromApi(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null

  const [activeVia, archiveVia] = await Promise.all([
    fetchClientsForClubViaAdminApi(cid, { mode: 'active' }),
    fetchClientsForClubViaAdminApi(cid, { mode: 'archive' }),
  ])
  if (!activeVia && !archiveVia) return null

  const activeClients = activeVia?.clients ?? []
  const archiveClients = archiveVia?.clients ?? []

  await mergeClientsIntoCache(activeClients)
  await mergeClientsIntoCache(archiveClients)

  const combined = [...activeClients, ...archiveClients]
  const pruned = await reconcileAdminClubCache(cid, combined, { preserveArchived: true })

  return {
    activeClients,
    archiveClients,
    combined,
    pruned,
    activeCount: activeClients.length,
    archiveCount: archiveClients.length,
    truncated: Boolean(activeVia?.truncated || archiveVia?.truncated),
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

  if (mode === 'active') {
    const merged = await mergeActiveAndArchiveClientsFromApi(cid)
    if (merged) {
      try {
        const viaMem = await fetchMembershipsForClubViaAdminApi(cid)
        await mergeMembershipsAndLifecycleFromApi(viaMem)
      } catch (memErr) {
        console.warn('[admin] list-memberships', memErr)
      }
      notifyAdminClientsCacheUpdated(cid)
      const { clients } = await listAdminClientsFromLocalCache(cid)
      return {
        ok: true,
        count: merged.activeCount,
        archiveCount: merged.archiveCount,
        source: 'admin_api',
        clients,
        pruned_clients: merged.pruned.pruned_clients,
        pruned_trainings: merged.pruned.pruned_trainings,
      }
    }
  }

  const viaApi = await fetchClientsForClubViaAdminApi(cid, { mode })
  if (viaApi) {
    await mergeClientsIntoCache(viaApi.clients)
    try {
      const viaMem = await fetchMembershipsForClubViaAdminApi(cid)
      await mergeMembershipsAndLifecycleFromApi(viaMem)
    } catch (memErr) {
      console.warn('[admin] list-memberships', memErr)
    }
    /* health_cards и body_measurements — по запросу карточки клиента (hydrate), не bulk pull клуба */
    const pruned = mode === 'active' ? await reconcileAdminClubCache(cid, viaApi.clients, { preserveArchived: true }) : { pruned_clients: 0, pruned_trainings: 0 }
    notifyAdminClientsCacheUpdated(cid)
    const { clients } = await listAdminClientsFromLocalCache(cid)
    return {
      ok: true,
      count: viaApi.count,
      source: 'admin_api',
      clients,
      pruned_clients: pruned.pruned_clients,
      pruned_trainings: pruned.pruned_trainings,
    }
  }

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
      const merged = await mergeActiveAndArchiveClientsFromApi(clubId)
      if (merged) {
        try {
          const viaMem = await fetchMembershipsForClubViaAdminApi(clubId)
          await mergeMembershipsAndLifecycleFromApi(viaMem)
        } catch (memErr) {
          console.warn('[admin] list-memberships', memErr)
        }
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
