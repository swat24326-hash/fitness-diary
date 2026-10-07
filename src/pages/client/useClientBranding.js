import { useEffect } from 'react'

const STATIC_MANIFEST = '/manifest-client.json'
const FALLBACK_TITLE = 'Мои тренировки'

function swapAttr(selector, attr, value) {
  const el = document.querySelector(selector)
  if (!el) return () => {}
  const prev = el.getAttribute(attr)
  el.setAttribute(attr, value)
  return () => {
    if (prev != null) el.setAttribute(attr, prev)
  }
}

/**
 * /me — приложение клуба: свой manifest (название клуба на значке), заголовок вкладки
 * и подпись для iPhone «На экран Домой». Уход с /me возвращает рабочее приложение зала.
 */
export function useClientBranding(clubName, manifestUrl) {
  useEffect(() => {
    const title = clubName || FALLBACK_TITLE
    const prevTitle = document.title
    document.title = title
    const restore = [
      swapAttr('link[rel="manifest"]', 'href', manifestUrl || STATIC_MANIFEST),
      swapAttr('meta[name="apple-mobile-web-app-title"]', 'content', title),
    ]
    return () => {
      document.title = prevTitle
      restore.forEach((fn) => fn())
    }
  }, [clubName, manifestUrl])
}
