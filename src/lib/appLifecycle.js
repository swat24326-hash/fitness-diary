import { initWakeNetworkRecovery } from './networkReachability.js'
import { checkRemoteBundleStale } from './appBuildInfo.js'
import { recordAppError } from './appErrorJournal.js'

export const APP_WAKE_EVENT = 'fitness-diary-app-wake'
export const APP_BUILD_STALE_EVENT = 'fitness-diary-build-stale'

const LONG_WAKE_MS = 30_000
const SW_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000

/** @type {Set<(detail: { sleptMs: number, long: boolean }) => void | Promise<void>>} */
const longWakeHandlers = new Set()

/**
 * @param {(detail: { sleptMs: number, long: boolean }) => void | Promise<void>} fn
 */
export function onLongAppWake(fn) {
  longWakeHandlers.add(fn)
  return () => longWakeHandlers.delete(fn)
}

async function probeServiceWorkerUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.()
    await reg?.update?.()
  } catch {
    /* ignore */
  }
}

async function probeBuildStale() {
  const { stale, localId, remoteId } = await checkRemoteBundleStale()
  if (!stale || typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(APP_BUILD_STALE_EVENT, { detail: { localId, remoteId } }),
  )
}

/**
 * @param {{ onLongWake?: (detail: { sleptMs: number, long: boolean }) => void | Promise<void> }} [opts]
 * @returns {() => void}
 */
export function initAppLifecycle(opts = {}) {
  if (typeof document === 'undefined') return () => {}

  const offNetwork = initWakeNetworkRecovery()
  if (opts.onLongWake) longWakeHandlers.add(opts.onLongWake)

  let hiddenAt = 0
  let swIntervalId = null

  const emitWake = (sleptMs) => {
    const long = sleptMs >= LONG_WAKE_MS
    const detail = { sleptMs, long }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(APP_WAKE_EVENT, { detail }))
    }
    if (long) {
      for (const fn of longWakeHandlers) {
        Promise.resolve(fn(detail)).catch((e) => {
          console.warn('[lifecycle] long wake handler', e)
        })
      }
      void probeBuildStale()
    }
    void probeServiceWorkerUpdate()
  }

  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (document.visibilityState !== 'visible') return
    const sleptMs = hiddenAt ? Date.now() - hiddenAt : 0
    hiddenAt = 0
    emitWake(sleptMs)
  }

  const onPageShow = (ev) => {
    if (ev.persisted) emitWake(LONG_WAKE_MS)
  }

  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pageshow', onPageShow)

  if (typeof window !== 'undefined') {
    swIntervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void probeServiceWorkerUpdate()
    }, SW_CHECK_INTERVAL_MS)
    void probeServiceWorkerUpdate()
  }

  return () => {
    offNetwork()
    if (opts.onLongWake) longWakeHandlers.delete(opts.onLongWake)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pageshow', onPageShow)
    if (swIntervalId != null) clearInterval(swIntervalId)
  }
}

/**
 * Полное мягкое восстановление: сеть + сессия + SW + reload.
 * @param {{
 *   refreshSession?: () => Promise<void>,
 *   refreshProfile?: () => Promise<void>,
 *   applyPwaUpdate?: () => Promise<void>,
 * }} steps
 */
export async function recoverApp(steps = {}) {
  const { refreshSession, refreshProfile, applyPwaUpdate } = steps
  try {
    if (refreshSession) await refreshSession()
    if (refreshProfile) await refreshProfile()
    await probeServiceWorkerUpdate()
    if (applyPwaUpdate) {
      await applyPwaUpdate()
      return
    }
    if (typeof window !== 'undefined') window.location.reload()
  } catch (e) {
    recordAppError({ source: 'app', error: String(e?.message ?? e ?? 'recover failed') })
    throw e
  }
}

/** Запросить постоянное хранилище (меньше шансов, что ОС сотрёт кэш PWA). */
export async function requestPersistentStorageOnce() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    const key = 'fitness-diary-storage-persist-asked'
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, '1')
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
