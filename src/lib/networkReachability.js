/**
 * Реальная доступность сети (не только navigator.onLine — на планшетах часто врёт).
 * Индикатор гантельки и sync используют этот статус.
 */
import { isSupabaseConfigured } from './supabase'

export const NETWORK_STATUS_EVENT = 'fitness-diary-network-status'

let reachable = typeof navigator !== 'undefined' ? navigator.onLine : true
let probeTimer = null
let probeGen = 0

function emit() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NETWORK_STATUS_EVENT, { detail: { online: reachable } }))
}

function setReachable(next) {
  const v = !!next
  if (reachable === v) return
  reachable = v
  emit()
}

/** @returns {boolean} */
export function getNetworkReachable() {
  return reachable
}

async function probeOnce() {
  if (typeof navigator === 'undefined') return
  if (!navigator.onLine) {
    setReachable(false)
    return
  }

  if (!isSupabaseConfigured()) {
    setReachable(true)
    return
  }

  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!base || !key) {
    setReachable(false)
    return
  }

  const gen = ++probeGen
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(`${base}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    if (gen !== probeGen) return
    /* Любой ответ сервера = интернет есть; сеть оборвана = fetch throw */
    setReachable(res.status < 500)
  } catch {
    if (gen !== probeGen) return
    setReachable(false)
  }
}

function scheduleProbe() {
  void probeOnce()
}

/**
 * @param {(online: boolean) => void} [onChange]
 * @returns {() => void} cleanup
 */
export function initNetworkReachability(onChange) {
  if (typeof window === 'undefined') return () => {}

  const notify = (online) => {
    onChange?.(online)
  }

  const onStatus = (e) => notify(e.detail?.online ?? reachable)
  window.addEventListener(NETWORK_STATUS_EVENT, onStatus)

  const onOffline = () => setReachable(false)
  const onOnline = () => scheduleProbe()
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleProbe()
  }

  window.addEventListener('offline', onOffline)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)

  notify(reachable)
  scheduleProbe()

  if (probeTimer) clearInterval(probeTimer)
  probeTimer = setInterval(() => {
    if (document.visibilityState === 'visible') scheduleProbe()
  }, 22_000)

  return () => {
    probeGen++
    window.removeEventListener(NETWORK_STATUS_EVENT, onStatus)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onVisible)
    if (probeTimer) {
      clearInterval(probeTimer)
      probeTimer = null
    }
  }
}

/** @param {(online: boolean) => void} fn */
export function subscribeNetworkStatus(fn) {
  if (typeof window === 'undefined') return () => {}
  const handler = (e) => fn(e.detail?.online ?? reachable)
  window.addEventListener(NETWORK_STATUS_EVENT, handler)
  fn(reachable)
  return () => window.removeEventListener(NETWORK_STATUS_EVENT, handler)
}
