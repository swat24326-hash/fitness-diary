/**
 * Подтягивает данные клиента в IndexedDB (для админской карточки).
 * Сначала /api/get-client на Vercel, иначе прямой Supabase из браузера.
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { buildPendingSyncKeysByTable, putStore, putStoreUnlessPendingSync } from '../localDb'
import { markRecordFromCloud } from '../syncLocalRecords'
import { normalizeBodyMeasurementRow } from '../bodyMeasures'
import { normalizeWeightEntryRow } from '../clientWeightCore'
import { pruneOrphanTrainingsForClient } from '../clientTrainingsCache'
import { ADMIN_SYNC_BATCH_SIZE } from './adminConstants'
import { fetchClientWorkspaceViaAdminApi } from './adminApiClient'
import { invalidateAdminClubWorkspaceCache } from './adminClubWorkspaceCache'
import { invalidateTrainerWorkspaceCache } from '../trainerWorkspaceCache'
import { notifyAdminClientsBrowseStorageChanged } from './adminClientsListReloadCore.js'
import { normalizeClientWorkspaceScope } from './clientWorkspaceScopeCore.js'

function notifyHydrated(clientId, _pruned_trainings = 0, clubId = '') {
  invalidateTrainerWorkspaceCache()
  invalidateAdminClubWorkspaceCache()
  notifyAdminClientsBrowseStorageChanged({
    reason: 'client-hydrated',
    clientId,
    ...(clubId ? { clubId: String(clubId) } : {}),
  })
}

async function cacheWorkspace({ client, memberships, health_card, body_measurements, client_weight_entries, trainings }, opts = {}) {
  const pending = opts.respectSyncQueue ? await buildPendingSyncKeysByTable() : null
  const save = (store, row) =>
    pending ? putStoreUnlessPendingSync(store, row, pending) : putStore(store, markRecordFromCloud(row))
  const glance = opts.scope === 'glance'

  if (client) await save('clients', client)
  for (const m of memberships ?? []) await save('memberships', m)

  // glance: не трогаем дневник в IDB и не prune-им тренировки (пустой список = «всё удалить»).
  if (glance) {
    notifyHydrated(client?.id, 0, client?.club_id)
    return { pruned_trainings: 0 }
  }

  if (health_card) await save('health_cards', health_card)
  for (const row of body_measurements ?? []) await save('body_measurements', normalizeBodyMeasurementRow(row))
  for (const row of client_weight_entries ?? []) await save('client_weight_entries', normalizeWeightEntryRow(row))
  for (const t of trainings ?? []) await save('trainings', t)

  const cid = String(client?.id ?? '').trim()
  let pruned_trainings = 0
  if (cid) {
    pruned_trainings = await pruneOrphanTrainingsForClient(cid, trainings ?? [], pending?.trainings ?? null)
  }

  notifyHydrated(client?.id, pruned_trainings, client?.club_id)
  return { pruned_trainings }
}

async function hydrateViaBrowserSupabase(clientId) {
  const { data: client, error: ce } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle()
  if (ce) throw ce
  if (!client) return { ok: false, reason: 'not_found' }

  const { data: memberships, error: me } = await supabase.from('memberships').select('*').eq('client_id', clientId)
  if (me) throw me

  const { data: hc, error: he } = await supabase.from('health_cards').select('*').eq('client_id', clientId).maybeSingle()
  if (he) throw he

  const body_measurements = []
  let mFrom = 0
  for (;;) {
    const { data: mRows, error: be } = await supabase
      .from('body_measurements')
      .select('*')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(mFrom, mFrom + ADMIN_SYNC_BATCH_SIZE - 1)
    if (be) throw be
    const chunk = mRows ?? []
    body_measurements.push(...chunk)
    if (!chunk.length || chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    mFrom += ADMIN_SYNC_BATCH_SIZE
  }

  const client_weight_entries = []
  let wFrom = 0
  for (;;) {
    const { data: wRows, error: we } = await supabase
      .from('client_weight_entries')
      .select('*')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(wFrom, wFrom + ADMIN_SYNC_BATCH_SIZE - 1)
    if (we) throw we
    const chunk = wRows ?? []
    client_weight_entries.push(...chunk)
    if (!chunk.length || chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    wFrom += ADMIN_SYNC_BATCH_SIZE
  }

  const trainings = []
  let from = 0
  for (;;) {
    const { data: trains, error: te } = await supabase
      .from('trainings')
      .select('*')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1)
    if (te) throw te
    const rows = trains ?? []
    trainings.push(...rows)
    if (!rows.length || rows.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }

  await cacheWorkspace(
    {
      client,
      memberships: memberships ?? [],
      health_card: hc ?? null,
      body_measurements,
      client_weight_entries,
      trainings,
    },
    { respectSyncQueue: true },
  )
  return { ok: true, source: 'browser' }
}

/**
 * @param {string} clientId
 * @param {{ allowBrowserFallback?: boolean, scope?: 'glance' | 'full' }} [opts]
 *   — для тренера: allowBrowserFallback false (только API)
 *   — scope=glance: клиент + абоны (desk / быстрый кадр); full — весь workspace
 */
export async function hydrateAdminClientWorkspace(clientId, opts = {}) {
  const allowBrowserFallback = opts.allowBrowserFallback !== false
  const scope = normalizeClientWorkspaceScope(opts.scope)
  if (!clientId || !isSupabaseConfigured()) {
    return { ok: false, reason: 'no_client_or_supabase' }
  }

  try {
    const viaApi = await fetchClientWorkspaceViaAdminApi(clientId, { scope })
    if (viaApi?.notFound) return { ok: false, reason: 'not_found' }
    if (viaApi?.client) {
      await cacheWorkspace(viaApi, { respectSyncQueue: true, scope })
      return { ok: true, source: 'admin_api', scope: viaApi.scope || scope }
    }
  } catch (e) {
    const msg = String(e?.message ?? e ?? '')
    if (!/failed to fetch|connection reset|timeout|сеть/i.test(msg)) {
      return { ok: false, error: msg }
    }
    if (!allowBrowserFallback) {
      return { ok: false, error: msg || 'Нет связи с сервером' }
    }
  }

  if (!allowBrowserFallback) {
    return { ok: false, reason: 'offline' }
  }

  // Browser fallback — полный набор (старый путь); glance через API предпочтителен.
  if (scope === 'glance') {
    return { ok: false, reason: 'offline' }
  }

  try {
    return await hydrateViaBrowserSupabase(clientId)
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}
