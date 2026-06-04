/**
 * Подтягивает данные клиента в IndexedDB (для админской карточки).
 * Сначала /api/get-client на Vercel, иначе прямой Supabase из браузера.
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { buildPendingSyncKeysByTable, putStore, putStoreUnlessPendingSync } from '../localDb'
import { markRecordFromCloud } from '../syncLocalRecords'
import { normalizeBodyMeasurementRow } from '../bodyMeasures'
import { pruneOrphanTrainingsForClient } from '../clientTrainingsCache'
import { ADMIN_SYNC_BATCH_SIZE } from './adminConstants'
import { fetchClientWorkspaceViaAdminApi } from './adminApiClient'
import { invalidateAdminClubWorkspaceCache } from './adminClubWorkspaceCache'
import { invalidateTrainerWorkspaceCache } from '../trainerWorkspaceCache'

function notifyHydrated(clientId, pruned_trainings = 0) {
  invalidateTrainerWorkspaceCache()
  invalidateAdminClubWorkspaceCache()
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('fitness-diary-storage', {
        detail: { reason: 'client-hydrated', client_id: clientId, pruned_trainings },
      }),
    )
  } catch {
    /* ignore */
  }
}

async function cacheWorkspace({ client, memberships, health_card, body_measurements, trainings }, opts = {}) {
  const pending = opts.respectSyncQueue ? await buildPendingSyncKeysByTable() : null
  const save = (store, row) =>
    pending ? putStoreUnlessPendingSync(store, row, pending) : putStore(store, markRecordFromCloud(row))

  if (client) await save('clients', client)
  for (const m of memberships ?? []) await save('memberships', m)
  if (health_card) await save('health_cards', health_card)
  for (const row of body_measurements ?? []) await save('body_measurements', normalizeBodyMeasurementRow(row))
  for (const t of trainings ?? []) await save('trainings', t)

  const cid = String(client?.id ?? '').trim()
  let pruned_trainings = 0
  if (cid) {
    pruned_trainings = await pruneOrphanTrainingsForClient(cid, trainings ?? [], pending?.trainings ?? null)
  }

  notifyHydrated(client?.id, pruned_trainings)
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
      trainings,
    },
    { respectSyncQueue: false },
  )
  return { ok: true, source: 'browser' }
}

/**
 * @param {string} clientId
 * @param {{ allowBrowserFallback?: boolean }} [opts] — для тренера: false (только API)
 */
export async function hydrateAdminClientWorkspace(clientId, opts = {}) {
  const allowBrowserFallback = opts.allowBrowserFallback !== false
  if (!clientId || !isSupabaseConfigured()) {
    return { ok: false, reason: 'no_client_or_supabase' }
  }

  try {
    const viaApi = await fetchClientWorkspaceViaAdminApi(clientId)
    if (viaApi?.notFound) return { ok: false, reason: 'not_found' }
    if (viaApi?.client) {
      await cacheWorkspace(viaApi, { respectSyncQueue: !allowBrowserFallback })
      return { ok: true, source: 'admin_api' }
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

  try {
    return await hydrateViaBrowserSupabase(clientId)
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}
