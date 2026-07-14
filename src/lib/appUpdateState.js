/** Флаг «есть новая версия, пользователь отложил» — точка на «Помощь». */

import { getClientBundleId } from './appBuildInfo.js'

export const APP_UPDATE_PENDING_EVENT = 'fitness-diary-update-pending'

const KEY = 'fitness-diary-update-pending-v1'
const APPLIED_KEY = 'fitness-diary-update-applied-v1'
const NOTICE_MAX_AGE_MS = 10 * 60 * 1000

function notify() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(APP_UPDATE_PENDING_EVENT, { detail: { pending: getAppUpdatePending() } }),
  )
}

export function getAppUpdatePending() {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** @param {boolean} pending */
export function setAppUpdatePending(pending) {
  if (typeof localStorage === 'undefined') return
  try {
    if (pending) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  notify()
}

export function clearAppUpdatePending() {
  setAppUpdatePending(false)
}

/** @param {(pending: boolean) => void} fn */
export function subscribeAppUpdatePending(fn) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => fn(getAppUpdatePending())
  window.addEventListener(APP_UPDATE_PENDING_EVENT, handler)
  fn(getAppUpdatePending())
  return () => window.removeEventListener(APP_UPDATE_PENDING_EVENT, handler)
}

/** Перед reload после PWA-обновления — чтобы показать баннер «Обновлено». */
export function markAppUpdateApplied() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      APPLIED_KEY,
      JSON.stringify({
        at: Date.now(),
        previousBundleId: getClientBundleId(),
      }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * Один раз после reload: была ли только что применена новая сборка.
 * @returns {{ bundleId: string, previousBundleId: string | null, changed: boolean } | null}
 */
export function consumeAppUpdateNotice() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(APPLIED_KEY)
    if (!raw) return null
    localStorage.removeItem(APPLIED_KEY)
    const o = JSON.parse(raw)
    const at = Number(o?.at) || 0
    if (!at || Date.now() - at > NOTICE_MAX_AGE_MS) return null
    const bundleId = getClientBundleId()
    if (!bundleId) return null
    const previousBundleId = o?.previousBundleId ? String(o.previousBundleId) : null
    const changed = !previousBundleId || previousBundleId !== bundleId
    return { bundleId, previousBundleId, changed }
  } catch {
    return null
  }
}
