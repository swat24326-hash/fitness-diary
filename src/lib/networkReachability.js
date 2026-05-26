/**
 * Реальная доступность сети (не только navigator.onLine — на планшетах часто врёт).
 * Проверка через тот же домен приложения — без запросов к Supabase (нет 401 в консоли).
 */
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

/** Офлайн-first: и navigator.onLine, и реальная доступность origin (не Supabase). */
export function isAppOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  return getNetworkReachable()
}

async function fetchOriginReachable(origin, signal) {
  let res = await fetch(`${origin}/`, {
    method: 'HEAD',
    cache: 'no-store',
    signal,
    credentials: 'same-origin',
  })
  if (res.ok || res.status === 405) return true
  res = await fetch(`${origin}/`, {
    method: 'GET',
    cache: 'no-store',
    signal,
    credentials: 'same-origin',
  })
  return res.ok
}

async function probeOnce() {
  if (typeof navigator === 'undefined') return
  if (!navigator.onLine) {
    setReachable(false)
    return
  }

  const origin = typeof window !== 'undefined' ? window.location?.origin : ''
  if (!origin) {
    setReachable(true)
    return
  }

  const gen = ++probeGen
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 6000)
    const ok = await fetchOriginReachable(origin, ctrl.signal)
    clearTimeout(timeout)
    if (gen !== probeGen) return
    setReachable(ok)
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
