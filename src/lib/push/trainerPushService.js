import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 300) }
  }
}

/** Публичный ключ уведомлений: из сборки или с сервера (приложение зала). */
export async function fetchVapidPublicKey() {
  const fromEnv = String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()
  if (fromEnv) return fromEnv

  const token = await getAccessTokenForAdminApi()
  if (!token) return ''
  const res = await fetch(`${apiOrigin()}/api/admin-data?action=push-subscription`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (res.status === 403) {
    throw new Error('Нет доступа к настройке уведомлений для этой роли')
  }
  if (!res.ok) return ''
  const data = await res.json().catch(() => ({}))
  return String(data?.public_key ?? '').trim()
}

/**
 * @param {{ clubId?: string, endpoint: string, p256dh: string, auth: string, userAgent?: string }} opts
 */
export async function saveTrainerPushSubscription(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=push-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'subscribe',
      club_id: opts.clubId ?? '',
      endpoint: opts.endpoint,
      p256dh: opts.p256dh,
      auth: opts.auth,
      user_agent: opts.userAgent ?? '',
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  if (data?.migration_pending || data?.stored === false) {
    throw new Error(
      'Не удалось сохранить подписку на сервере. Проверьте миграцию user_push_subscriptions (docs/PUSH_SETUP.md).',
    )
  }
  return data
}

/**
 * @param {string} endpoint
 */
export async function removeTrainerPushSubscription(endpoint) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=push-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'unsubscribe',
      endpoint,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}

/**
 * Напоминания Ежедневника на этом устройстве: без scheduleReminders — чтение.
 * @param {string} endpoint
 * @param {boolean} [scheduleReminders]
 */
export async function trainerPushPrefs(endpoint, scheduleReminders) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=push-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'prefs',
      endpoint,
      ...(typeof scheduleReminders === 'boolean' ? { schedule_reminders: scheduleReminders } : {}),
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}

export async function sendTrainerPushTest() {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=push-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ op: 'test' }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}
