/**
 * «Сеть» в UI = Wi‑Fi/интернет устройства (navigator.onLine).
 * «Облако» = отдельная проверка origin/API (Vercel может быть недоступен при живом Wi‑Fi).
 */
export const NETWORK_STATUS_EVENT = 'fitness-diary-network-status'
export const CLOUD_STATUS_EVENT = 'fitness-diary-cloud-status'

let cloudReachable = true
let cloudCheckedAt = 0

function emitCloud() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CLOUD_STATUS_EVENT, { detail: { reachable: isCloudReachable() } }))
}

/** Любой HTTP-ответ сервера приложения = origin доступен. */
export function isHttpResponseReachable(status) {
  return typeof status === 'number' && status >= 100 && status < 600
}

/** Wi‑Fi / интернет на устройстве (индикатор, локальная работа). */
export function isBrowserOnline() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

/** @deprecated alias — UI «онлайн» = браузер, не probe к Vercel */
export function isAppOnline() {
  return isBrowserOnline()
}

export function getNetworkReachable() {
  return isCloudReachable()
}

/** Сервер приложения отвечает (sync, профиль). */
export function isCloudReachable() {
  if (!isBrowserOnline()) return false
  if (cloudReachable) return true
  return Date.now() - cloudCheckedAt < 45_000
}

export function noteAppNetworkResponse(response) {
  if (response && isHttpResponseReachable(response.status)) {
    cloudReachable = true
    cloudCheckedAt = Date.now()
    emitCloud()
  }
}

/** @param {boolean} browserOnline @param {boolean} [cloudOk] — для verify-скрипта */
export function computeIsAppOnline(browserOnline, cloudOk = true) {
  void cloudOk
  return browserOnline !== false
}

/** Проверка облака (Диагностика). Не трогает индикатор Wi‑Fi. */
export async function probeCloudNow() {
  if (!isBrowserOnline()) {
    cloudReachable = false
    cloudCheckedAt = Date.now()
    emitCloud()
    return false
  }

  const origin = typeof window !== 'undefined' ? window.location?.origin : ''
  if (!origin) {
    cloudReachable = true
    cloudCheckedAt = Date.now()
    emitCloud()
    return true
  }

  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(`${origin}/manifest.json`, {
      method: 'GET',
      signal: ctrl.signal,
      credentials: 'same-origin',
    })
    cloudReachable = isHttpResponseReachable(res.status)
  } catch {
    cloudReachable = false
  } finally {
    clearTimeout(timeout)
  }
  cloudCheckedAt = Date.now()
  emitCloud()
  return cloudReachable
}

/** @deprecated — используйте probeCloudNow */
export async function probeNetworkNow() {
  return probeCloudNow()
}

/**
 * @param {(online: boolean) => void} [onChange]
 * @returns {() => void} cleanup
 */
export function initNetworkReachability(onChange) {
  if (typeof window === 'undefined') return () => {}

  const notify = () => onChange?.(isAppOnline())

  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)

  notify()

  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

/** @param {(online: boolean) => void} fn */
export function subscribeNetworkStatus(fn) {
  if (typeof window === 'undefined') return () => {}
  const onBrowser = () => fn(isAppOnline())
  window.addEventListener('online', onBrowser)
  window.addEventListener('offline', onBrowser)
  fn(isAppOnline())
  return () => {
    window.removeEventListener('online', onBrowser)
    window.removeEventListener('offline', onBrowser)
  }
}
