/**
 * Фоновый prefetch дневника и абонементов при открытии формы/карточки (online, без блокировки UI).
 */

import { ensureClientTrainingsCached } from '../clientTrainingsEnsure.js'
import { refreshMembershipsForStats } from '../membershipCacheRefresh.js'
import { isSupabaseConfigured } from '../supabase.js'
import { isAppOnline } from '../syncService.js'

/**
 * @param {string} clientId
 * @param {{ trainerId?: string, clubId?: string }} [opts]
 */
export function prefetchTrainerClientWorkspace(clientId, opts = {}) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return
  if (!isSupabaseConfigured() || !isAppOnline()) return

  void ensureClientTrainingsCached(cid).catch(() => {})

  const trainerId = String(opts.trainerId ?? '').trim()
  const clubId = String(opts.clubId ?? '').trim()
  if (trainerId || clubId) {
    void refreshMembershipsForStats({ trainerId, clubId, notify: false }).catch(() => {})
  }
}
