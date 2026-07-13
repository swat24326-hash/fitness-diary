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
 * @param {string} raw
 */
export function normalizeVapidPublicKey(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '')
}

/**
 * VAPID public key = 65 байт (0x04 + координаты P-256).
 * @param {string} raw
 */
export function isValidVapidPublicKey(raw) {
  const key = normalizeVapidPublicKey(raw)
  if (!key || key.length < 80) return false
  try {
    const bytes = urlBase64ToUint8Array(key)
    return bytes.length === 65 && bytes[0] === 0x04
  } catch {
    return false
  }
}

/**
 * @param {unknown} err
 * @param {{ isEdge?: boolean }} [opts]
 */
export function formatPushSubscribeError(err, opts = {}) {
  const raw = String(err?.message ?? err ?? '').trim()
  const lower = raw.toLowerCase()
  const isEdge =
    opts.isEdge === true ||
    (typeof navigator !== 'undefined' && /Edg\//.test(String(navigator.userAgent ?? '')))

  if (!raw) return 'Не удалось включить уведомления'

  if (lower.includes('push service error') || lower.includes('registration failed')) {
    if (isEdge) {
      return [
        'Edge не смог подключиться к службе уведомлений Windows.',
        'Проверьте: Windows → Уведомления → Microsoft Edge включён;',
        'в Edge для сайта разрешены уведомления;',
        'закройте режим InPrivate и VPN;',
        'нажмите «Включить» ещё раз (подписка сбросится автоматически).',
      ].join(' ')
    }
    return 'Браузер не подключился к push-службе. Разрешите уведомления для сайта и попробуйте снова.'
  }

  if (lower.includes('not allowed') || lower.includes('denied') || lower.includes('permission')) {
    return 'Разрешите уведомления в настройках браузера для этого сайта.'
  }

  if (lower.includes('invalid key') || lower.includes('applicationserverkey')) {
    return 'Неверный ключ push на сервере. Администратору: проверить VAPID_PUBLIC_KEY в Vercel.'
  }

  return raw
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
