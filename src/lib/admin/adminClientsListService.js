/**
 * Список клиентов для админки: по клубу (Supabase / IndexedDB).
 * Без club_id в облаке не выполняем неограниченный select.
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { isRetryableNetworkError } from '../supabaseRetry'
import { buildPendingSyncKeysByTable, getDb, putStore, putStoreUnlessPendingSync } from '../localDb'
import { fetchClientsForClubViaAdminApi, fetchMembershipsForClubViaAdminApi } from './adminApiClient'
import { fetchHealthCardsForClubViaApi } from '../syncApiClient'
import { normalizeBodyMeasurementRow } from '../bodyMeasures'
import { ADMIN_CLIENTS_REMOTE_LIMIT, ADMIN_SYNC_BATCH_SIZE } from './adminConstants'

const LOCAL_DATA_CHANGED = 'fitness-diary-storage'

function notifyLocalDataChanged() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_DATA_CHANGED, { detail: {} }))
  } catch {
    /* ignore */
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
    for (const row of rows) {
      await putStore('clients', row)
    }
    total += rows.length
    if (rows.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return { ok: true, count: total }
}

async function mergeClientsIntoCache(rows) {
  for (const row of rows) {
    await putStore('clients', row)
  }
}

async function mergeMembershipsIntoCache(rows) {
  for (const row of rows) {
    await putStore('memberships', row)
  }
}

async function mergeHealthCardsIntoCache(rows) {
  for (const row of rows) {
    await putStore('health_cards', row)
  }
}

async function mergeBodyMeasurementsIntoCache(rows) {
  const pending = await buildPendingSyncKeysByTable()
  for (const row of rows) {
    await putStoreUnlessPendingSync('body_measurements', normalizeBodyMeasurementRow(row), pending)
  }
}

/** Один раз после пакета merge — иначе админка перезагружается 3–4 раза подряд. */
function notifyAdminClientsCacheUpdated() {
  notifyLocalDataChanged({ reason: 'admin-clients-cache' })
}

/** Подтянуть клиентов клуба из облака в IndexedDB (сначала API на Vercel). */
export async function pullAdminClientsFromCloud(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured()) return { ok: false, reason: 'no_club' }

  try {
    const viaApi = await fetchClientsForClubViaAdminApi(cid)
    if (viaApi) {
      await mergeClientsIntoCache(viaApi.clients)
      try {
        const viaMem = await fetchMembershipsForClubViaAdminApi(cid)
        if (viaMem?.memberships?.length) {
          await mergeMembershipsIntoCache(viaMem.memberships)
        }
      } catch (memErr) {
        console.warn('[admin] list-memberships', memErr)
      }
      try {
        const viaHc = await fetchHealthCardsForClubViaApi(cid)
        if (viaHc?.health_cards?.length) {
          await mergeHealthCardsIntoCache(viaHc.health_cards)
        }
        if (viaHc?.body_measurements?.length) {
          await mergeBodyMeasurementsIntoCache(viaHc.body_measurements)
        }
      } catch (hcErr) {
        console.warn('[admin] list-health-cards', hcErr)
      }
      notifyAdminClientsCacheUpdated()
      return { ok: true, count: viaApi.count, source: 'admin_api' }
    }
  } catch (e) {
    throw e
  }

  const pulled = await pullClientsForClubIntoCache(cid)
  if (pulled.ok) notifyAdminClientsCacheUpdated()
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
  const db = await getDb()
  let all = await db.getAll('clients')
  all = all.filter((c) => String(c.club_id) === clubId)
  all.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
  const truncated = all.length >= ADMIN_CLIENTS_REMOTE_LIMIT
  const clients = truncated ? all.slice(0, ADMIN_CLIENTS_REMOTE_LIMIT) : all
  return { clients, truncated }
}

/**
 * @param {{ clubId?: string }} p
 * @returns {Promise<{ clients: object[], source: string, fallbackReason: string | null, cloudNeedsClub?: boolean, truncated?: boolean }>}
 */
export async function listAdminClientsForClub(p) {
  const clubId = String(p?.clubId ?? '').trim()

  if (!isSupabaseConfigured()) {
    const db = await getDb()
    let all = await db.getAll('clients')
    if (clubId) all = all.filter((c) => c.club_id === clubId)
    all.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
    return { clients: all, source: 'local', fallbackReason: null, truncated: false }
  }

  if (!clubId) {
    return { clients: [], source: 'remote', fallbackReason: null, cloudNeedsClub: true, truncated: false }
  }

  try {
    try {
      const viaApi = await fetchClientsForClubViaAdminApi(clubId)
      if (viaApi) {
        await mergeClientsIntoCache(viaApi.clients)
        try {
          const viaMem = await fetchMembershipsForClubViaAdminApi(clubId)
          if (viaMem?.memberships?.length) {
            await mergeMembershipsIntoCache(viaMem.memberships)
          }
        } catch (memErr) {
          console.warn('[admin] list-memberships', memErr)
        }
        try {
          const viaHc = await fetchHealthCardsForClubViaApi(clubId)
          if (viaHc?.health_cards?.length) {
            await mergeHealthCardsIntoCache(viaHc.health_cards)
          }
          if (viaHc?.body_measurements?.length) {
            await mergeBodyMeasurementsIntoCache(viaHc.body_measurements)
          }
        } catch (hcErr) {
          console.warn('[admin] list-health-cards', hcErr)
        }
        const sorted = [...viaApi.clients].sort((a, b) =>
          String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'),
        )
        const truncated = sorted.length >= ADMIN_CLIENTS_REMOTE_LIMIT
        const clients = truncated ? sorted.slice(0, ADMIN_CLIENTS_REMOTE_LIMIT) : sorted
        return {
          clients,
          source: 'admin_api',
          fallbackReason: null,
          truncated,
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
