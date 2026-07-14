/** Идентификатор текущего JS-бандла (хеш из имени файла Vite) — для сравнения с prod после деплоя. */
export function getClientBundleId() {
  if (typeof document === 'undefined') return null
  const el = document.querySelector('script[type="module"][src*="/assets/index-"]')
  const src = el?.getAttribute('src') ?? ''
  const m = src.match(/index-([^.]+)\.js/)
  return m ? m[1] : null
}

/** ISO-время сборки, зашитое в vite.config.js при сборке. */
export function getClientBuildTimeIso() {
  try {
    if (typeof __FITNESS_DIARY_BUILD_TIME__ === 'string' && __FITNESS_DIARY_BUILD_TIME__) {
      return __FITNESS_DIARY_BUILD_TIME__
    }
  } catch {
    /* dev без define */
  }
  return null
}

/** Человекочитаемое время сборки для Диагностики (русская локаль). */
export function formatBuildTimeRu(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

export function getClientBuildTimeLabel() {
  return formatBuildTimeRu(getClientBuildTimeIso())
}

/** «2 ч назад», «вчера» — проще, чем запоминать id. */
export function formatBuildAgeRu(iso, nowMs = Date.now()) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diffMin = Math.max(0, Math.floor((nowMs - t) / 60_000))
  if (diffMin < 2) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} ч назад`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'вчера'
  if (diffD < 7) return `${diffD} дн назад`
  return formatBuildTimeRu(iso)
}

export function getClientBuildAgeLabel() {
  return formatBuildAgeRu(getClientBuildTimeIso())
}

export function formatBuildLabel(bundleId, buildTimeIso) {
  const id = bundleId && bundleId !== '—' ? String(bundleId) : '—'
  const time = formatBuildTimeRu(buildTimeIso)
  if (id === '—' && time === '—') return '—'
  if (time === '—') return id
  if (id === '—') return time
  return `${id} · ${time}`
}

export function getPwaControllerState() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return 'n/a'
  if (!navigator.serviceWorker.controller) return 'ожидание SW'
  return 'активен'
}

/** @param {string} html */
export function parseBundleIdFromHtml(html) {
  const m = String(html ?? '').match(/\/assets\/index-([^.]+)\.js/)
  return m ? m[1] : null
}

/** @param {string} html */
export function parseBuildTimeFromHtml(html) {
  const m = String(html ?? '').match(/name=["']fitness-diary-build-time["']\s+content=["']([^"']+)["']/)
  return m ? m[1] : null
}

/** URL для сверки с живой версией на сервере (обход кэша SW и CDN). */
export function getRemoteBuildProbeUrl(nowMs = Date.now()) {
  if (typeof window === 'undefined' || !window.location?.origin) return `/index.html?fd_build_probe=${nowMs}`
  return `${window.location.origin}/index.html?fd_build_probe=${nowMs}`
}

/**
 * Сравнить локальную сборку с index.html в интернете (если SW не подтянул обновление).
 * @returns {Promise<{
 *   localId: string | null,
 *   remoteId: string | null,
 *   stale: boolean,
 *   localBuildTimeIso: string | null,
 *   remoteBuildTimeIso: string | null,
 *   remoteBuildTime: string,
 *   remoteBuildAge: string,
 *   probeUrl: string,
 * }>}
 */
export async function checkRemoteBundleStale() {
  const localId = getClientBundleId()
  const localBuildTimeIso = getClientBuildTimeIso()
  const probeUrl = getRemoteBuildProbeUrl()
  if (typeof fetch === 'undefined') {
    return {
      localId,
      remoteId: null,
      stale: false,
      localBuildTimeIso,
      remoteBuildTimeIso: null,
      remoteBuildTime: '—',
      remoteBuildAge: '',
      probeUrl,
    }
  }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl && setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(probeUrl, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      signal: ctrl?.signal,
    })
    if (!res.ok) {
      return {
        localId,
        remoteId: null,
        stale: false,
        localBuildTimeIso,
        remoteBuildTimeIso: null,
        remoteBuildTime: '—',
        remoteBuildAge: '',
        probeUrl,
      }
    }
    const html = await res.text()
    const remoteId = parseBundleIdFromHtml(html)
    const remoteBuildTimeIso = parseBuildTimeFromHtml(html)
    const stale = Boolean(localId && remoteId && localId !== remoteId)
    return {
      localId,
      remoteId,
      stale,
      localBuildTimeIso,
      remoteBuildTimeIso,
      remoteBuildTime: formatBuildTimeRu(remoteBuildTimeIso),
      remoteBuildAge: formatBuildAgeRu(remoteBuildTimeIso),
      probeUrl,
    }
  } catch {
    return {
      localId,
      remoteId: null,
      stale: false,
      localBuildTimeIso,
      remoteBuildTimeIso: null,
      remoteBuildTime: '—',
      remoteBuildAge: '',
      probeUrl,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
