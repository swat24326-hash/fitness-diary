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
    void refreshMembershipsForStats({ trainerId, clubId, notify: false })
      .then((res) => {
        /* Не отработало (cooldown, офлайн, ошибка) — ключ отпускаем, иначе следующий заход
           в черновик уже не попробует, и тренер увидит прочерки вместо абонемента. */
        if (!res?.ok) prefetchedClientKeys.delete(key)
      })
      .catch(() => {
        prefetchedClientKeys.delete(key)
      })
  }
}

/**
 * Точечная догрузка абонементов, когда тренер уже уперся: плитка пустая или списывать не с чего.
 * В отличие от prefetch — ждём результат и обходим общий cooldown.
 * @param {{ trainerId?: string }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function ensureTrainerMembershipsFresh(opts = {}) {
  if (!isSupabaseConfigured() || !isAppOnline()) return { ok: false, reason: 'offline' }
  const trainerId = String(opts.trainerId ?? '').trim()
  if (!trainerId) return { ok: false, reason: 'trainer_only' }
  try {
    const res = await refreshMembershipsForStats({ trainerId, notify: false, force: true })
    return res?.ok ? { ok: true } : { ok: false, reason: String(res?.reason ?? 'failed') }
  } catch (e) {
    return { ok: false, reason: String(e?.message ?? e ?? 'failed') }
  }
}

/** @internal тесты */
export function clearTrainerClientPrefetchKeys() {
  prefetchedClientKeys.clear()
}
