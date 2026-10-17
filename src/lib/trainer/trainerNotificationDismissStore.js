/**
 * localStorage: какие pending client_plans тренер скрыл на этом устройстве.
 */
import { withTrainerPendingDismissal } from './trainerNotificationDismissCore.js'

const KEY = 'trainer_client_plan_pending_dismissed_v1'

/** @returns {Record<string, string>} */
export function loadTrainerPendingDismissals() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    /** @type {Record<string, string>} */
    const out = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (k && typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** @param {Record<string, string>} map */
function save(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {string} planId
 * @param {string} [atIso]
 * @returns {Record<string, string>}
 */
export function dismissTrainerPendingNotification(planId, atIso = new Date().toISOString()) {
  const next = withTrainerPendingDismissal(loadTrainerPendingDismissals(), planId, atIso)
  save(next)
  return next
}
