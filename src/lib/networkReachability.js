/**
 * Реальная доступность сети (navigator.onLine на PWA/Android часто врёт).
 * Probe: /api/me-profile (401 = origin доступен), manifest без no-store (не ломать SW).
 */
export const NETWORK_STATUS_EVENT = 'fitness-diary-network-status'

const PROBE_INTERVAL_MS = 22_000
const PROBE_TIMEOUT_MS = 8000

/** Оптимистично true — probe/API уточняют; ложный offline хуже ложного online. */
let reachable = true
let probeTimer = null
let probeGen = 0

function emit() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NETWORK_STATUS_EVENT, { detail: { online: isAppOnline() } }))
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

/** @param {boolean} reachableFlag @param {boolean} [navigatorOnline] */
export function computeIsAppOnline(reachableFlag, navigatorOnline = true) {
  if (reachableFlag) return true
  if (navigatorOnline !== false) return true
  return false
}

/**
 * Офлайн-first, но без ложного «нет сети»:
 * - probe/API → reachable
 * - navigator.onLine — запасной сигнал на десктопе
 */
export function isAppOnline() {
  const navOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  return computeIsAppOnline(getNetworkReachable(), navOnline)
}

/** После HTTP-ответа приложения — сеть точно есть. */
export function noteAppNetworkResponse(response) {
  if (response && isHttpResponseReachable(response.status)) {
    setReachable(true)
  }
}

/** Ручная проверка (Диагностика, Sync). @returns {Promise<boolean>} */
export async function probeNetworkNow() {
  await probeOnce()
  return isAppOnline()
}

async function fetchUrlReachable(url, signal) {
  const res = await fetch(url, {
    method: 'GET',
    signal,
    credentials: 'same-origin',
  })
  return isHttpResponseReachable(res.status)
}

async function fetchProbeReachable(origin) {
  const attempts = [`${origin}/api/me-profile`, `${origin}/manifest.json`]

  for (const url of attempts) {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    try {
      if (await fetchUrlReachable(url, ctrl.signal)) {
        clearTimeout(timeout)
        return true
      }
    } catch {
      /* следующий URL */
    } finally {
      clearTimeout(timeout)
    }
  }

  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  try {
    let ok = await fetch(`${origin}/`, {
      method: 'HEAD',
      signal: ctrl.signal,
      credentials: 'same-origin',
    }).then((res) => isHttpResponseReachable(res.status) || res.status === 405)
    if (!ok) {
      ok = await fetch(`${origin}/`, {
        method: 'GET',
        signal: ctrl.signal,
        credentials: 'same-origin',
      }).then((res) => isHttpResponseReachable(res.status))
    }
    return ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
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
    const ok = await fetchProbeReachable(origin)
    if (gen !== probeGen) return
    if (ok) {
      setReachable(true)
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setReachable(false)
    }
  } catch {
    if (gen !== probeGen) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setReachable(false)
    }
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

  const notify = () => {
    onChange?.(isAppOnline())
  }

  const onStatus = () => notify()
  window.addEventListener(NETWORK_STATUS_EVENT, onStatus)

  const onOffline = () => scheduleProbe()
  const onOnline = () => {
    setReachable(true)
    scheduleProbe()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleProbe()
  }

  window.addEventListener('offline', onOffline)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)

  notify()
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
  const handler = () => fn(isAppOnline())
  window.addEventListener(NETWORK_STATUS_EVENT, handler)
  fn(isAppOnline())
  return () => window.removeEventListener(NETWORK_STATUS_EVENT, handler)
}
