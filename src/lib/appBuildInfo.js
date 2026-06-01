/** Идентификатор текущего JS-бандла (хеш из имени файла Vite) — для сравнения с prod после деплоя. */
export function getClientBundleId() {
  if (typeof document === 'undefined') return null
  const el = document.querySelector('script[type="module"][src*="/assets/index-"]')
  const src = el?.getAttribute('src') ?? ''
  const m = src.match(/index-([^.]+)\.js/)
  return m ? m[1] : null
}

export function getPwaControllerState() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return 'n/a'
  if (!navigator.serviceWorker.controller) return 'ожидание SW'
  return 'активен'
}
