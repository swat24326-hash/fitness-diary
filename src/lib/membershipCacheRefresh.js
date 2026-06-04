/**
 * Обновление абонементов в IndexedDB перед «Не активные» / сводкой.
 * Карточка клиента делает hydrate; статистика без этого видела устаревший кэш.
 */

import { isSupabaseConfigured } from './supabase'
import { buildPendingSyncKeysByTable, putStoreUnlessPendingSync } from './localDb'
import { markRecordFromCloud } from './syncLocalRecords'
import { isAppOnline } from './syncService'
import { fetchMembershipsForClubViaAdminApi } from './admin/adminApiClient'
import { fetchTrainerPullViaApi } from './syncApiClient'
import { clearTrainerWorkspaceSnapshotSync } from './trainerWorkspaceCache'
import { invalidateAdminClubWorkspaceCache } from './admin/adminClubWorkspaceCache'

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

  try {
    if (trainerId) {
      const via = await fetchTrainerPullViaApi({ skipTrainings: true })
      if (!via?.memberships) return { ok: false, reason: 'no_api' }
      const count = await mergeMembershipRows(via.memberships)
      bumpCaches()
      if (p.notify !== false) notifyRefreshed()
      return { ok: true, count, source: 'trainer-pull' }
    }

    if (!clubId) return { ok: false, reason: 'no_club' }

    const viaMem = await fetchMembershipsForClubViaAdminApi(clubId)
    if (!viaMem?.memberships) return { ok: false, reason: 'no_api' }
    const count = await mergeMembershipRows(viaMem.memberships)
    bumpCaches()
    if (p.notify !== false) notifyRefreshed()
    return { ok: true, count, source: 'list-memberships' }
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e ?? 'refresh failed') }
  }
}
