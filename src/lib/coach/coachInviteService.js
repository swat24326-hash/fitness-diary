/** Планшет тренера: QR для входа в приложение на телефоне (POST /api/coach-auth { action: 'invite' }). */
import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'
import { buildCoachJoinUrl } from './coachJoinLink.js'

const FETCH_MS = 15_000

/** @returns {Promise<{ url: string, expiresAt: string }>} */
export async function createCoachPhoneInvite() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Нет сети — QR можно показать только онлайн')
  }
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')
  let res
  try {
    res = await fetchWithAppTimeout(
      `${window.location.origin}/api/coach-auth`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ action: 'invite' }),
      },
      FETCH_MS,
    )
  } catch {
    throw new Error('Нет связи с сервером — попробуйте ещё раз')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.token) throw new Error(data?.error || 'Сервер не ответил — попробуйте ещё раз')
  return { url: buildCoachJoinUrl(window.location.origin, data.token), expiresAt: data.expires_at }
}
