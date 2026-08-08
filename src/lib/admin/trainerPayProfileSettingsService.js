import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { defaultTrainerPayProfile, normalizeTrainerPayProfile } from './trainerPayProfileCore.js'

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
export async function fetchTrainerPayProfiles(clubId) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const params = new URLSearchParams({
    action: 'trainer-pay-profiles',
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
 * @param {string} trainerId
 */
export async function fetchTrainerPayProfile(clubId, trainerId) {
  const data = await fetchTrainerPayProfiles(clubId)
  const list = Array.isArray(data?.profiles) ? data.profiles : []
  const hit = list.find((p) => String(p.trainer_id) === String(trainerId))
  return {
    profile: normalizeTrainerPayProfile(hit ?? defaultTrainerPayProfile(trainerId, clubId), {
      trainer_id: trainerId,
      club_id: clubId,
    }),
    migration_needed: Boolean(data?.migration_needed),
  }
}

/**
 * @param {{ trainer_id: string, club_id: string, on_plan: boolean, rate_adjustment_rub: number }} profile
 */
export async function saveTrainerPayProfile(profile) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const res = await fetch(`${apiOrigin()}/api/admin-data?action=trainer-pay-profiles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(profile),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`)
  return data
}
