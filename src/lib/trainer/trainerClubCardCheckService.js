/**
 * Онлайн: есть ли в клубе клиент с этой картой (чужой тренер / desk / админ).
 * Локальный IDB тренера видит только своих — без этого шага дубль проходит.
 */
import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { deviceHeaders } from '../deviceIdentity.js'
import { fetchWithAppTimeout, isAppOnline } from '../networkReachability.js'
import { normalizeSalesCardNumber } from '../admin/salesClientMatchCore.js'
import { resolveTrainerClubCardCheckResponse } from './trainerClubCardCheckCore.js'

const TIMEOUT_MS = 12_000

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

/**
 * @param {unknown} cardNumber
 * @returns {Promise<{ blocked: false } | { blocked: true, error: string, client: object|null }>}
 */
export async function checkTrainerClubCardConflictOnline(cardNumber) {
  const card = normalizeSalesCardNumber(cardNumber)
  if (!card) return { blocked: false }
  if (!isAppOnline()) return { blocked: false }

  let token
  try {
    token = await getAccessTokenForAdminApi()
  } catch {
    return { blocked: false }
  }
  if (!token) return { blocked: false }

  const qs = new URLSearchParams({ mode: 'card-check', card })
  let res
  try {
    res = await fetchWithAppTimeout(
      `${apiOrigin()}/api/trainer-pull?${qs.toString()}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, ...deviceHeaders },
        credentials: 'same-origin',
        cache: 'no-store',
      },
      TIMEOUT_MS,
    )
  } catch {
    return { blocked: false }
  }

  let body = null
  try {
    body = await res.json()
  } catch {
    return { blocked: false }
  }
  if (!res.ok) return { blocked: false }
  return resolveTrainerClubCardCheckResponse(body)
}
