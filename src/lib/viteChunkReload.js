/**
 * После деплоя старый index.js тянет удалённый chunk (PwaUpdatePrompt-XXXX.js) —
 * один мягкий reload, без цикла.
 */

const RELOAD_KEY = 'fit_vite_chunk_reload_at'
const RELOAD_COOLDOWN_MS = 15_000

function shouldReloadNow() {
  try {
    const prev = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (prev && Date.now() - prev < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    return true
  }
}

/** @param {unknown} err */
export function isViteStaleChunkError(err) {
  const msg = String(err?.message ?? err ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError/i.test(
    msg,
  )
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
    if (shouldReloadNow()) window.location.reload()
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason
    if (!isViteStaleChunkError(reason)) return
    if (shouldReloadNow()) window.location.reload()
  })
}
