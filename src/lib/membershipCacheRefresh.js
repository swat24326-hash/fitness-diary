/**
 * Обновление абонементов в IndexedDB перед «Не активные» / сводкой.
 * Карточка клиента делает hydrate; статистика без этого видела устаревший кэш.
 */

import { isSupabaseConfigured } from './supabase'
import { buildPendingSyncKeysByTable, putStoreUnlessPendingSync } from './localDb'
import { markRecordFromCloud } from './syncLocalRecords'
import { isAppOnline } from './syncService'
import { fetchMembershipsForClubViaAdminApi } from './admin/adminApiClient'
import { mergeClientHallLifecycleIntoCache } from './admin/clientHallLifecycleAdminCache.js'
import { fetchTrainerPullViaApi } from './syncApiClient'
import { clearTrainerWorkspaceSnapshotSync } from './trainerWorkspaceCache'
import { invalidateAdminClubWorkspaceCache } from './admin/adminClubWorkspaceCache'

const REFRESH_COOLDOWN_MS = 60_000

/** @type {Map<string, number>} */
const lastRefreshAtByKey = new Map()

/** @type {Map<string, Promise<{ ok: boolean, [key: string]: unknown }>>} */
const inFlightRefreshByKey = new Map()

function refreshKey(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  if (trainerId) return `t:${trainerId}`
  const clubId = String(p.clubId ?? '').trim()
  return clubId ? `c:${clubId}` : ''
}

async function mergeMembershipRows(rows) {
  const pending = await buildPendingSyncKeysByTable()
  let n = 0
  for (const row of rows ?? []) {
    const id = String(row?.id ?? '').trim()
    if (!id) continue
    await putStoreUnlessPendingSync('memberships', markRecordFromCloud(row), pending)
    n++
  }
  return n
}

function bumpCaches() {
  clearTrainerWorkspaceSnapshotSync()
  invalidateAdminClubWorkspaceCache()
}

function notifyRefreshed() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('fitness-diary-storage', { detail: { reason: 'memberships-refreshed' } }))
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ clubId?: string, trainerId?: string, notify?: boolean }} p
 */
export async function refreshMembershipsForStats(p = {}) {
  if (!isSupabaseConfigured() || !isAppOnline()) {
    return { ok: false, reason: 'offline' }
  }

  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const key = refreshKey({ trainerId, clubId })
  if (!key) return { ok: false, reason: 'no_club' }

  const now = Date.now()
  const last = lastRefreshAtByKey.get(key) ?? 0
  if (p.force !== true && now - last < REFRESH_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown' }
  }

  const inflight = inFlightRefreshByKey.get(key)
  if (inflight) return inflight

  const run = (async () => {
    lastRefreshAtByKey.set(key, Date.now())
    try {
      if (trainerId) {
        const via = await fetchTrainerPullViaApi({ skipTrainings: true })
        if (!via?.memberships) return { ok: false, reason: 'no_api' }
        const count = await mergeMembershipRows(via.memberships)
        bumpCaches()
        if (p.notify !== false) notifyRefreshed()
        return { ok: true, count, source: 'trainer-pull' }
      }

      if (!clubId || p.adminClubScope !== true) {
        return { ok: false, reason: 'trainer_only' }
      }

      const viaMem = await fetchMembershipsForClubViaAdminApi(clubId)
      if (!viaMem?.memberships) return { ok: false, reason: 'no_api' }
      const count = await mergeMembershipRows(viaMem.memberships)
      if (viaMem.client_hall_lifecycle?.length) {
        await mergeClientHallLifecycleIntoCache(viaMem.client_hall_lifecycle)
      }
      bumpCaches()
      if (p.notify !== false) notifyRefreshed()
      return { ok: true, count, source: 'list-memberships' }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e ?? 'refresh failed') }
    }
  })()

  inFlightRefreshByKey.set(key, run)
  try {
    return await run
  } finally {
    inFlightRefreshByKey.delete(key)
  }
}
