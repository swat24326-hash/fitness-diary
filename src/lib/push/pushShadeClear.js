/**
 * Убрать плашки своего приложения из системной шторки (браузер / PWA).
 */
import { pushShadeBelongsToApp, pushShadeNotificationApp } from './pushShadeCore.js'

/**
 * @param {'client'|'coach'|'staff'} app
 * @param {{ getRegistration?: () => Promise<ServiceWorkerRegistration|null|undefined> }} [deps]
 * @returns {Promise<number>} сколько плашек закрыли
 */
export async function clearPushShadeForApp(app, deps = {}) {
  const target = String(app || '')
  if (target !== 'client' && target !== 'coach' && target !== 'staff') return 0

  const getReg =
    deps.getRegistration ??
    (async () => {
      if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null
      try {
        return await navigator.serviceWorker.ready
      } catch {
        return null
      }
    })
  const reg = await getReg()
  if (!reg?.getNotifications) return 0

  let list
  try {
    list = await reg.getNotifications()
  } catch {
    return 0
  }

  let closed = 0
  for (const n of list ?? []) {
    const noteApp = pushShadeNotificationApp(n?.data?.url)
    if (!pushShadeBelongsToApp(noteApp, target)) continue
    try {
      n.close()
      closed += 1
    } catch {
      /* ignore */
    }
  }
  return closed
}
