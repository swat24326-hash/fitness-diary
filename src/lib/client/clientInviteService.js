/** Сотрудник: выдать клиенту ссылку на /me или отключить все его входы (POST /api/client-invite). */
import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

const FETCH_MS = 15_000

async function postInvite(body) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Нет сети — ссылку можно выдать только онлайн')
  }
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  let res
  try {
    res = await fetchWithAppTimeout(
      `${window.location.origin}/api/client-invite`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
      },
      FETCH_MS,
    )
  } catch {
    throw new Error('Нет связи с сервером — попробуйте ещё раз')
  }
  if (res.status === 404) {
    throw new Error('Приложение клиента на сервере ещё не включено — обновите приложение или напишите администратору')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Сервер не ответил — попробуйте ещё раз')
  return data
}

/** Токен в #фрагменте: не попадает в логи сервера и в Referer. */
export function buildClientJoinUrl(origin, token) {
  return `${String(origin).replace(/\/$/, '')}/me/join#t=${encodeURIComponent(token)}`
}

/** @returns {Promise<{ url: string, expiresAt: string }>} */
export async function createClientInvite(clientId) {
  const data = await postInvite({ client_id: clientId })
  return { url: buildClientJoinUrl(window.location.origin, data.token), expiresAt: data.expires_at }
}

export async function revokeClientAppAccess(clientId) {
  await postInvite({ client_id: clientId, action: 'revoke' })
}
