import { useEffect } from 'react'
import { APP_BRAND_NAME } from '../../lib/appBrand.js'
import { isIosUserAgent } from '../../lib/client/clientInstallCore.js'

const STATIC_MANIFEST = '/manifest-client.json'

/**
 * На /me manifest зала не ставится (public/manifest-boot.js) — ссылку клуба добавляем сами.
 * iPhone — без manifest: он берёт manifest с загрузки страницы и не видит позднюю подмену; без manifest
 * значок запоминает текущий адрес /me?h=… (вход значка), название — apple-mobile-web-app-title (INC-2026-10-10-01).
 */
function setManifest(href) {
  if (isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints)) return () => {}
  let el = document.querySelector('link[rel="manifest"]')
  if (el) return swapAttr('link[rel="manifest"]', 'href', href)
  el = document.createElement('link')
  el.rel = 'manifest'
  el.href = href
  document.head.appendChild(el)
  return () => el.remove()
}

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
 * /me и /coach — приложения «Результат Плюс»: свой manifest (название клуба на значке), заголовок вкладки,
 * подпись для iPhone «На экран Домой». Уход возвращает рабочее приложение зала («Ядро»).
 */
export function useClientBranding(clubName, manifestUrl) {
  useEffect(() => {
    const title = clubName || APP_BRAND_NAME
    const prevTitle = document.title
    document.title = title
    const restore = [
      setManifest(manifestUrl || STATIC_MANIFEST),
      swapAttr('meta[name="apple-mobile-web-app-title"]', 'content', title),    ]
    return () => {
      document.title = prevTitle
      restore.forEach((fn) => fn())
    }
  }, [clubName, manifestUrl])
}
