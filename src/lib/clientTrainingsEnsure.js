/**
 * Подтянуть тренировки клиента в IndexedDB с сервера, если локально пусто.
 * Ситуация: Sync/prune оставил карточку без дневника, а облако и статистика целы.
 */

import { isSupabaseConfigured } from './supabase.js'
import { listTrainingsByClientId } from './localDbClubQuery.js'
import { hydrateAdminClientWorkspace } from './admin/adminClientHydrate.js'
import { isAppOnline } from './syncService.js'

/**
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts] — force: всегда hydrate full (дороже)
 * @returns {Promise<object[]>}
 */
export async function ensureClientTrainingsCached(clientId, opts = {}) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []

  let local = await listTrainingsByClientId(cid)
  const force = opts.force === true
  if (!force && local.length > 0) return local

  if (!isSupabaseConfigured() || !isAppOnline()) return local

  try {
    const h = await hydrateAdminClientWorkspace(cid, {
      allowBrowserFallback: false,
      scope: 'full',
    })
    if (h?.ok) {
      local = await listTrainingsByClientId(cid)
    }
  } catch (e) {
    console.warn('[ensureClientTrainingsCached]', e)
  }
  return local
}
