/**
 * Реальная доступность сети (navigator.onLine на PWA/Android часто врёт).
 * Probe: manifest.json + /api/me-profile (401 = origin доступен), не только navigator.
 */
export const NETWORK_STATUS_EVENT = 'fitness-diary-network-status'

const PROBE_INTERVAL_MS = 22_000
const PROBE_TIMEOUT_MS = 6000

let reachable = typeof navigator !== 'undefined' ? navigator.onLine !== false : true
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

/** Любой HTTP-ответ сервера приложения = сеть до origin есть. */
export function isHttpResponseReachable(status) {
  return typeof status === 'number' && status >= 100 && status < 600
}

/** Офлайн-first: probe + успешные API, не navigator.onLine (PWA часто «офлайн» при Wi‑Fi). */
export function isAppOnline() {
  return getNetworkReachable()
}

/** После успешного fetch к /api/* — считаем сеть онлайн. */
export function noteAppNetworkResponse(response) {
  if (response && isHttpResponseReachable(response.status)) {
    setReachable(true)
  }
}

/** Ручная проверка (Диагностика, Sync перед flush). @returns {Promise<boolean>} */
export async function probeNetworkNow() {
  await probeOnce()
  return getNetworkReachable()
}

async function fetchProbeReachable(origin, signal) {
  const urls = [`${origin}/manifest.json`, `${origin}/api/me-profile`]
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal,
        credentials: 'same-origin',
      })
      if (isHttpResponseReachable(res.status)) return true
    } catch {
      /* следующий URL */
    }
  }

  try {
    let res = await fetch(`${origin}/`, {
      method: 'HEAD',
      cache: 'no-store',
      signal,
      credentials: 'same-origin',
    })
    if (isHttpResponseReachable(res.status) || res.status === 405) return true
    res = await fetch(`${origin}/`, {
      method: 'GET',
      cache: 'no-store',
      signal,
      credentials: 'same-origin',
    })
    return isHttpResponseReachable(res.status)
  } catch {
    return false
  }
}

async function probeOnce() {
  if (typeof navigator === 'undefined') return

  const origin = typeof window !== 'undefined' ? window.location?.origin : ''
  if (!origin) {
    setReachable(true)
    return
  }

  const gen = ++probeGen
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    const ok = await fetchProbeReachable(origin, ctrl.signal)
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

  const onOffline = () => scheduleProbe()
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
  }, PROBE_INTERVAL_MS)

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
