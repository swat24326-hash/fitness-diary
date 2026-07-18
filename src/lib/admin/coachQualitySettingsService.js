import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { defaultCoachQualityConfig, normalizeCoachQualityConfig } from './coachQualityConfigCore.js'

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
export async function fetchCoachQualitySettings(clubId) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')
  const params = new URLSearchParams({
    action: 'coach-quality-settings',
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
 * Конфиг для расчёта (дефолт, если сеть/таблица недоступны).
 * @param {string} clubId
 */
export async function loadCoachQualityConfigForClub(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return defaultCoachQualityConfig()
  try {
    const data = await fetchCoachQualitySettings(cid)
    return normalizeCoachQualityConfig(data?.config)
  } catch {
    return defaultCoachQualityConfig()
  }
}

/**
 * @param {string} clubId
 * @param {{ config?: object, reset?: boolean }} payload
 */
export async function saveCoachQualitySettings(clubId, payload = {}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')
  const body = {
    club_id: clubId,
    reset: payload.reset === true,
    config: payload.config,
  }
  const res = await fetch(`${apiOrigin()}/api/admin-data?action=coach-quality-settings`, {
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
