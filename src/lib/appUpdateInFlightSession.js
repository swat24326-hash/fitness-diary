/**
 * sessionStorage: флаг обновления в полёте.
 */

import {
  PWA_UPDATE_IN_FLIGHT_KEY,
  isPwaUpdateInFlightStamp,
  parsePwaUpdateInFlight,
} from './appUpdateInFlightCore.js'

export function markPwaUpdateInFlight() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(PWA_UPDATE_IN_FLIGHT_KEY, JSON.stringify({ at: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function clearPwaUpdateInFlight() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(PWA_UPDATE_IN_FLIGHT_KEY)
  } catch {
    /* ignore */
  }
}

export function isPwaUpdateInFlight(now = Date.now()) {
  if (typeof sessionStorage === 'undefined') return false
  try {
    return isPwaUpdateInFlightStamp(parsePwaUpdateInFlight(sessionStorage.getItem(PWA_UPDATE_IN_FLIGHT_KEY)), now)
  } catch {
    return false
  }
}
