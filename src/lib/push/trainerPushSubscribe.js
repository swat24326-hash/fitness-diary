/**
 * Подписка на Web Push: ожидание SW, сброс и повтор (Edge / WNS).
 */

import {
  formatPushSubscribeError,
  isValidVapidPublicKey,
  normalizeVapidPublicKey,
  urlBase64ToUint8Array,
} from './trainerPushCore.js'

/**
 * @param {number} [timeoutMs]
 */
export async function waitForPushServiceWorker(timeoutMs = 10000) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    throw new Error('Service Worker недоступен')
  }

  let reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Service Worker не зарегистрирован. Обновите страницу.')), timeoutMs)
      }),
    ])
    reg = await navigator.serviceWorker.getRegistration('/')
  }

  if (!reg) throw new Error('Service Worker не зарегистрирован. Обновите страницу.')

  if (!reg.active && reg.installing) {
    await new Promise((resolve, reject) => {
      const sw = reg.installing
      const timer = setTimeout(() => reject(new Error('Service Worker долго активируется. Обновите страницу.')), timeoutMs)
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') {
          clearTimeout(timer)
          resolve(undefined)
        }
      })
    })
  }

  return navigator.serviceWorker.ready
}

/**
 * @param {ServiceWorkerRegistration} reg
 */
async function clearPushSubscription(reg) {
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    try {
      await sub.unsubscribe()
    } catch {
      /* stale */
    }
  }
}

/**
 * @param {ServiceWorkerRegistration} reg
 * @param {string} publicKey
 */
async function subscribeOnce(reg, publicKey) {
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
}

function isPushServiceError(err) {
  const msg = String(err?.message ?? err ?? '').toLowerCase()
  return msg.includes('push service error') || msg.includes('registration failed')
}

/**
 * @param {string} publicKey
 * @returns {Promise<PushSubscription>}
 */
export async function subscribePushManager(publicKey) {
  const key = normalizeVapidPublicKey(publicKey)
  if (!isValidVapidPublicKey(key)) {
    throw new Error('Неверный ключ push на сервере. Администратору: VAPID_PUBLIC_KEY в Vercel (см. docs/PUSH_SETUP.md).')
  }

  const reg = await waitForPushServiceWorker()

  let sub = await reg.pushManager.getSubscription()
  if (sub) return sub

  try {
    return await subscribeOnce(reg, key)
  } catch (firstErr) {
    if (!isPushServiceError(firstErr)) throw firstErr
    await clearPushSubscription(reg)
    return subscribeOnce(reg, key)
  }
}

export { formatPushSubscribeError }
