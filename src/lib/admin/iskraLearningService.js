/**
 * Клиентский сервис самообучения ИСКРЫ: локально + async sync в облако.
 */

import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { buildLearningSignalKey, normalizeLearningEvent } from './iskraLearningCore.js'
import {
  getLocalIskraLearningBundle,
  recordLocalIskraLearningEvent,
} from '../iskraLearningStore.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

/**
 * @param {{
 *   clubId: string,
 *   eventType: string,
 *   signalKey?: string,
 *   advisorRoleId?: string,
 *   userMessage?: string,
 *   chipId?: string,
 *   handlerId?: string,
 *   introKind?: string,
 *   hintId?: string,
 *   note?: string,
 *   meta?: object,
 * }} opts
 */
export function recordIskraLearningFeedback(opts) {
  const normalized = normalizeLearningEvent({
    club_id: opts.clubId,
    event_type: opts.eventType,
    signal_key:
      opts.signalKey ||
      (opts.hintId ? buildLearningSignalKey('hint', opts.hintId) : '') ||
      (opts.chipId || opts.handlerId
        ? buildLearningSignalKey('chip', opts.chipId || opts.handlerId)
        : ''),
    advisor_role_id: opts.advisorRoleId,
    user_message: opts.userMessage,
    chip_id: opts.chipId,
    handler_id: opts.handlerId,
    intro_kind: opts.introKind,
    note: opts.note,
    meta: opts.meta,
  })
  if (!normalized.ok) return { ok: false, error: normalized.error }

  recordLocalIskraLearningEvent(normalized.event)
  void syncIskraLearningEvent(normalized.event)
  return { ok: true, event: normalized.event }
}

/**
 * @param {object} event
 */
export async function syncIskraLearningEvent(event) {
  if (typeof window === 'undefined') return { ok: false }
  const token = await getAccessTokenForAdminApi()
  if (!token) return { ok: false, reason: 'no_session' }

  try {
    const res = await fetchWithAppTimeout(
      `${apiOrigin()}/api/admin-data?action=iskra-learning`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          club_id: event.club_id,
          event_type: event.event_type,
          signal_key: event.signal_key,
          advisor_role_id: event.advisor_role_id,
          user_message: event.user_message,
          note: event.note,
          meta: event.meta,
        }),
      },
      12_000,
    )
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

/**
 * @param {string} clubId
 */
export function loadIskraLearningBundleForUi(clubId) {
  return getLocalIskraLearningBundle(clubId)
}
