import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { defaultTrainerPayPlanConfig, normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'

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

/** @param {string} clubId */
export async function fetchTrainerPayPlanSettings(clubId) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const params = new URLSearchParams({
    action: 'trainer-pay-plan-settings',
    club_id: clubId,
  })
  const res = await fetch(`${apiOrigin()}/api/admin-data?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`)
  return data
}

/**
 * @param {string} clubId
 * @returns {Promise<import('./trainerPayPlanCore.js').TrainerPayPlanConfig>}
 */
export async function loadTrainerPayPlanConfigForClub(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return defaultTrainerPayPlanConfig()
  try {
    const data = await fetchTrainerPayPlanSettings(cid)
    return normalizeTrainerPayPlanConfig(data?.config)
  } catch {
    return defaultTrainerPayPlanConfig()
  }
}

/**
 * @param {string} clubId
 * @param {{ config?: object, reset?: boolean }} payload
 */
export async function saveTrainerPayPlanSettings(clubId, payload = {}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const body = {
    club_id: clubId,
    reset: payload.reset === true,
    config: payload.config,
  }
  const res = await fetch(`${apiOrigin()}/api/admin-data?action=trainer-pay-plan-settings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`)
  return data
}
