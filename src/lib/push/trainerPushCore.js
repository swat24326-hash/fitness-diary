/**
 * Нормализация Web Push подписки (клиент ↔ сервер).
 */

/**
 * @returns {boolean}
 */
export function isTrainerPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * @param {string} base64String
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * @param {PushSubscription | null | undefined} sub
 */
export function serializePushSubscription(sub) {
  if (!sub) return { ok: false, error: 'Нет подписки' }
  const json = sub.toJSON()
  const endpoint = String(json.endpoint ?? '').trim()
  const p256dh = String(json.keys?.p256dh ?? '').trim()
  const auth = String(json.keys?.auth ?? '').trim()
  if (!endpoint || !p256dh || !auth) return { ok: false, error: 'Неполная подписка push' }
  return {
    ok: true,
    payload: {
      endpoint,
      p256dh,
      auth,
      user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent ?? '').slice(0, 500) : '',
    },
  }
}

/**
 * @param {object} body
 */
export function normalizePushSubscribePayload(body) {
  const endpoint = String(body?.endpoint ?? '').trim()
  const p256dh = String(body?.p256dh ?? body?.keys?.p256dh ?? '').trim()
  const auth = String(body?.auth ?? body?.keys?.auth ?? '').trim()
  const clubId = String(body?.club_id ?? '').trim()
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: 'Неполные данные подписки' }
  }
  return {
    ok: true,
    payload: {
      endpoint,
      p256dh,
      auth,
      club_id: clubId || null,
      user_agent: String(body?.user_agent ?? '').trim().slice(0, 500) || null,
    },
  }
}

/**
 * @param {object} body
 */
export function normalizePushUnsubscribePayload(body) {
  const endpoint = String(body?.endpoint ?? '').trim()
  if (!endpoint) return { ok: false, error: 'Укажите endpoint' }
  return { ok: true, endpoint }
}

/**
 * @param {{ title?: string, body?: string, url?: string, tag?: string }} opts
 */
export function buildDispatchPushPayload(opts = {}) {
  const title = String(opts.title ?? 'Новое задание').trim().slice(0, 120) || 'Новое задание'
  const body = String(opts.body ?? 'Откройте Планёрку в приложении').trim().slice(0, 240)
  const url = String(opts.url ?? '/trainer?inbox=1').trim() || '/trainer?inbox=1'
  const tag = String(opts.tag ?? 'iskra-dispatch').trim() || 'iskra-dispatch'
  return { title, body, url, tag }
}
