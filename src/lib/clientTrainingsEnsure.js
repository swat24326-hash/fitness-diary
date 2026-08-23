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

/** @type {Map<string, Promise<object[]>>} */
const inFlightEnsureByClient = new Map()

/**
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ trainings: object[], online: boolean, ensureOk: boolean }>}
 */
export async function ensureClientTrainingsCachedWithStatus(clientId, opts = {}) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return { trainings: [], online: false, ensureOk: true }

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
    return { trainings: await listTrainingsByClientId(cid), online, ensureOk: true }
  }

  if (!online) {
    return { trainings: await listTrainingsByClientId(cid), online: false, ensureOk: true }
  }

  const inflight = inFlightEnsureByClient.get(cid)
  if (inflight) return inflight

  const run = (async () => {
    lastEnsureAtByClient.set(cid, nowMs)
    let ensureOk = true
    try {
      const h = await hydrateAdminClientWorkspace(cid, {
        allowBrowserFallback: false,
        scope: 'full',
      })
      if (!h?.ok) {
        ensureOk = false
        console.warn('[ensureClientTrainingsCached]', h?.error ?? h?.reason ?? 'hydrate failed')
      }
    } catch (e) {
      ensureOk = false
      console.warn('[ensureClientTrainingsCached]', e)
    }
    return {
      trainings: await listTrainingsByClientId(cid),
      online: true,
      ensureOk,
    }
  })()

  inFlightEnsureByClient.set(cid, run)
  try {
    return await run
  } finally {
    inFlightEnsureByClient.delete(cid)
  }
}

/**
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function ensureClientTrainingsCached(clientId, opts = {}) {
  const { trainings } = await ensureClientTrainingsCachedWithStatus(clientId, opts)
  return trainings
}

/** Сброс TTL (тесты / после смены клиента на том же экране не нужен). */
export function clearClientTrainingsEnsureCache() {
  lastEnsureAtByClient.clear()
  inFlightEnsureByClient.clear()
}
