/**
 * После деплоя старый index.js тянет удалённый chunk (PwaUpdatePrompt-XXXX.js) —
 * сервер отдаёт HTML → MIME error / чёрный экран. Один жёсткий recover без цикла.
 */

const RELOAD_KEY = 'fit_vite_chunk_reload_at'
const HARD_KEY = 'fit_vite_chunk_hard_recover_at'
const RELOAD_COOLDOWN_MS = 12_000
const HARD_COOLDOWN_MS = 60_000

function readTs(key) {
  try {
    return Number(sessionStorage.getItem(key) || 0)
  } catch {
    return 0
  }
}

function writeTs(key) {
  try {
    sessionStorage.setItem(key, String(Date.now()))
  } catch {
    /* ignore */
  }
}

function withinCooldown(key, ms) {
  const prev = readTs(key)
  return Boolean(prev && Date.now() - prev < ms)
}

/** @param {unknown} err */
export function isViteStaleChunkError(err) {
  const msg = String(err?.message ?? err ?? '')
  if (
    /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError|vite:preload/i.test(
      msg,
    )
  ) {
    return true
  }
  // Chrome: script с MIME text/html (SPA fallback на несуществующий /assets/*.js)
  if (/MIME type of ["']?text\/html|Expected a JavaScript-or-Wasm module script/i.test(msg)) {
    return true
  }
  // Наш lazy().then(m => m.PwaUpdatePrompt) при битом chunk
  if (/Cannot read properties of undefined \(reading ['"]PwaUpdatePrompt['"]\)/i.test(msg)) {
    return true
  }
  if (/Cannot read properties of undefined \(reading ['"]AppUpdatedBanner['"]\)/i.test(msg)) {
    return true
  }
  return false
}

async function clearSiteCaches() {
  if (typeof caches === 'undefined' || !caches?.keys) return
  try {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {
    /* ignore */
  }
}

async function unregisterServiceWorkers() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistrations) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  } catch {
    /* ignore */
  }
}

/**
 * Мягкий reload; если уже пробовали недавно — сброс SW/кэша и reload.
 * @returns {Promise<boolean>} true если инициировали восстановление
 */
export async function recoverFromStaleViteDeploy() {
  if (typeof window === 'undefined') return false

  if (!withinCooldown(RELOAD_KEY, RELOAD_COOLDOWN_MS)) {
    writeTs(RELOAD_KEY)
    window.location.reload()
    return true
  }

  if (withinCooldown(HARD_KEY, HARD_COOLDOWN_MS)) return false
  writeTs(HARD_KEY)
  writeTs(RELOAD_KEY)
  await clearSiteCaches()
  await unregisterServiceWorkers()
  const url = new URL(window.location.href)
  url.searchParams.set('_fit_recover', String(Date.now()))
  window.location.replace(url.toString())
  return true
}

/** Подписка на сбои lazy/chunk после деплоя. */
export function armViteChunkReloadOnStaleDeploy() {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    try {
      event.preventDefault?.()
    } catch {
      /* ignore */
    }
    void recoverFromStaleViteDeploy()
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason
    if (!isViteStaleChunkError(reason)) return
    try {
      event.preventDefault?.()
    } catch {
      /* ignore */
    }
    void recoverFromStaleViteDeploy()
  })

  window.addEventListener('error', (event) => {
    const msg = String(event?.message ?? '')
    const filename = String(event?.filename ?? '')
    if (isViteStaleChunkError(msg) || (/\/assets\/.+\.js/i.test(filename) && /MIME|module script/i.test(msg))) {
      void recoverFromStaleViteDeploy()
    }
  })
}
