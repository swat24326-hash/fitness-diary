/**
 * Подтянуть полный дневник клиента в IndexedDB с сервера (онлайн).
 * Даже если локально уже есть часть тренировок (например только август из журнала).
 */

import { isSupabaseConfigured } from './supabase.js'
import { listTrainingsByClientId } from './localDbClubQuery.js'
import { hydrateAdminClientWorkspace } from './admin/adminClientHydrate.js'
import { isAppOnline } from './syncService.js'
import {
  CLIENT_TRAININGS_ENSURE_TTL_MS,
  shouldRefreshClientTrainingsFromCloud,
} from './clientTrainingsEnsureCore.js'

/** @type {Map<string, number>} */
const lastEnsureAtByClient = new Map()

/**
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function ensureClientTrainingsCached(clientId, opts = {}) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []

  const online = Boolean(isSupabaseConfigured() && isAppOnline())
  const force = opts.force === true
  const nowMs = Date.now()
  const refresh = shouldRefreshClientTrainingsFromCloud({
    online,
    force,
    lastEnsureAtMs: lastEnsureAtByClient.get(cid) ?? null,
    nowMs,
    ttlMs: CLIENT_TRAININGS_ENSURE_TTL_MS,
  })

  if (!refresh) {
    return listTrainingsByClientId(cid)
  }

  if (!online) {
    return listTrainingsByClientId(cid)
  }

  try {
    const h = await hydrateAdminClientWorkspace(cid, {
      allowBrowserFallback: false,
      scope: 'full',
    })
    if (h?.ok) {
      lastEnsureAtByClient.set(cid, nowMs)
    }
  } catch (e) {
    console.warn('[ensureClientTrainingsCached]', e)
  }
  return listTrainingsByClientId(cid)
}

/** Сброс TTL (тесты / после смены клиента на том же экране не нужен). */
export function clearClientTrainingsEnsureCache() {
  lastEnsureAtByClient.clear()
}
