/**
 * Фоновый prefetch дневника и абонементов при открытии формы/карточки (online, без блокировки UI).
 */

import { ensureClientTrainingsCached } from '../clientTrainingsEnsure.js'
import { refreshMembershipsForStats } from '../membershipCacheRefresh.js'
import { isSupabaseConfigured } from '../supabase.js'
import { isAppOnline } from '../syncService.js'

/** @type {Set<string>} */
const prefetchedClientKeys = new Set()

/**
 * @param {string} clientId
 * @param {{ trainerId?: string, clubId?: string }} [opts]
 */
export function prefetchTrainerClientWorkspace(clientId, opts = {}) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return
  if (!isSupabaseConfigured() || !isAppOnline()) return

  const trainerId = String(opts.trainerId ?? '').trim()
  const clubId = String(opts.clubId ?? '').trim()
  const key = `${cid}:${trainerId || clubId || 'x'}`
  if (prefetchedClientKeys.has(key)) return
  prefetchedClientKeys.add(key)

  void ensureClientTrainingsCached(cid).catch(() => {})
  if (trainerId || clubId) {
    void refreshMembershipsForStats({ trainerId, clubId, notify: false }).catch(() => {})
  }
}

/** @internal тесты */
export function clearTrainerClientPrefetchKeys() {
  prefetchedClientKeys.clear()
}
