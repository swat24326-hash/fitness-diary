/* eslint-disable no-restricted-globals */
/**
 * Обработчики Web Push для service worker (importScripts из Workbox).
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/trainer?inbox=1'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-trainer-inbox', url })
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
      return undefined
    }),
  )
})
