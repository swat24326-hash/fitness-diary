/* eslint-disable no-restricted-globals */
/**
 * Обработчики Web Push для service worker (importScripts из Workbox).
 * Один SW на приложение зала и приложение клиента (/me): клик ведёт в окно своего приложения.
 *
 * Шторка (на всю сеть):
 * — если это же приложение уже на экране — плашку не дублируем, только сигнал push-received;
 * — клик по плашке — close + focus/open (как раньше).
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
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const noteApp = appOfPath(new URL(url, self.location.origin).pathname)
      const focusedSame = list.some((client) => {
        try {
          return client.focused && appOfPath(new URL(client.url).pathname) === noteApp
        } catch {
          return false
        }
      })

      const signal = Promise.resolve().then(() => {
        list.forEach((client) => {
          try {
            client.postMessage({ type: 'push-received', url, tag })
          } catch {
            /* ignore */
          }
        })
      })

      if (focusedSame) {
        await signal
        return
      }

      await Promise.all([
        self.registration.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-96.png',
          tag,
          silent: data.silent === true,
          data: { url },
        }),
        signal,
      ])
    })(),
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
