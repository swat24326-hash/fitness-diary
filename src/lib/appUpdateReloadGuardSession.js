/**
 * sessionStorage-обёртка для appUpdateReloadGuard (браузер).
 */

import {
  PWA_UPDATE_RELOAD_GUARD_KEY,
  nextPwaUpdateReloadGuard,
  parsePwaUpdateReloadGuard,
} from './appUpdateReloadGuard.js'

export function readPwaUpdateReloadGuardFromSession() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return parsePwaUpdateReloadGuard(sessionStorage.getItem(PWA_UPDATE_RELOAD_GUARD_KEY))
  } catch {
    return null
  }
}

/** @returns {{ at: number, attempts: number }} */
export function recordPwaUpdateReloadAttempt() {
  const next = nextPwaUpdateReloadGuard(readPwaUpdateReloadGuardFromSession())
  try {
    sessionStorage.setItem(PWA_UPDATE_RELOAD_GUARD_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function clearPwaUpdateReloadGuardSession() {
  try {
    sessionStorage.removeItem(PWA_UPDATE_RELOAD_GUARD_KEY)
  } catch {
    /* ignore */
  }
}
