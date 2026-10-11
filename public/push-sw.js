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
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        tag,
        data: { url },
      }),
      /* Открытое приложение сразу обновляет числа и ленту — не ждёт опроса (pushReceivedSignal.js). */
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((list) => list.forEach((client) => client.postMessage({ type: 'push-received', url, tag })))
        .catch(() => {}),
    ]),
  )
})

/* Копия pushAppOfPath из src/lib/push/pushOpenCore.js: SW не импортирует модули приложения. */
function appOfPath(path) {
  if (path === '/me' || path.startsWith('/me/')) return 'client'
  if (path === '/coach' || path.startsWith('/coach/')) return 'coach'
  return 'staff'
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/trainer?inbox=1'
  const app = appOfPath(new URL(url, self.location.origin).pathname)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!('focus' in client)) continue
        if (appOfPath(new URL(client.url).pathname) !== app) continue
        /* Окно уже открыто — пусть само откроет диалог (PushOpenNavigator), без перезагрузки. */
        client.postMessage({ type: 'push-open', url })
        return client.focus()
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
      return undefined
    }),
  )
})
