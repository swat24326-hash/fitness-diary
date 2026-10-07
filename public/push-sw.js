/* eslint-disable no-restricted-globals */
/**
 * Обработчики Web Push для service worker (importScripts из Workbox).
 * Один SW на приложение зала и приложение клиента (/me): клик ведёт в окно своего приложения.
 */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data?.json?.() ?? {}
  } catch {
    data = { body: event.data?.text?.() ?? '' }
  }

  const title = data.title || 'Новое задание'
  const body = data.body || 'Откройте Планёрку в приложении'
  const url = data.url || '/trainer?inbox=1'
  const tag = data.tag || 'iskra-dispatch'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag,
      data: { url },
    }),
  )
})

function isClientAppPath(path) {
  return path === '/me' || path.startsWith('/me/')
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/trainer?inbox=1'
  const forClient = isClientAppPath(new URL(url, self.location.origin).pathname)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!('focus' in client)) continue
        if (isClientAppPath(new URL(client.url).pathname) !== forClient) continue
        if (!forClient) client.postMessage({ type: 'open-trainer-inbox', url })
        return client.focus()
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
      return undefined
    }),
  )
})
