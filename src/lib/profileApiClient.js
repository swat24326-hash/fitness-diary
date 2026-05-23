import { supabase } from './supabase'
import { getAccessTokenForAdminApi } from './admin/adminApiClient'

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function origin() {
  return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
}

async function getSessionAccessToken() {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession()
    session = refreshed.data?.session ?? null
  }
  return session?.access_token ?? null
}

/** @returns {Promise<{ profile: object | null, error: Error | null }>} */
export async function fetchMyProfileViaApi() {
  const token = await getSessionAccessToken()
  if (!token) {
    return { profile: null, error: new Error('Нет сессии') }
  }

  const doFetch = async (accessToken) => {
    return fetch(`${origin()}/api/me-profile`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'same-origin',
      cache: 'no-store',
    })
  }

  let res
  try {
    res = await doFetch(token)
    if (res.status === 401) {
      const refreshed = await supabase.auth.refreshSession()
      const retryToken = refreshed.data?.session?.access_token
      if (retryToken) res = await doFetch(retryToken)
    }
  } catch (e) {
    return { profile: null, error: new Error(e?.message ?? 'Сеть') }
  }

  const data = await parseJson(res)
  if (!res.ok) {
    return { profile: null, error: new Error(data?.error ? String(data.error) : `Ошибка ${res.status}`) }
  }
  return { profile: data.profile ?? null, error: null }
}

/** @returns {Promise<{ trainer: object | null, error: Error | null, usedApi: boolean }>} */
export async function updateTrainerClubViaApi(trainerId, clubId) {
  const token = await getAccessTokenForAdminApi()
  if (!token) {
    return { trainer: null, error: new Error('Нет сессии администратора'), usedApi: false }
  }

  let res
  try {
    res = await fetch(`${origin()}/api/update-trainer-club`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ trainer_id: trainerId, club_id: clubId }),
    })
  } catch (e) {
    return { trainer: null, error: new Error(e?.message ?? 'Сеть'), usedApi: false }
  }

  const ct = res.headers.get('content-type') || ''
  if (res.status === 404 || res.status === 405 || ct.includes('text/html')) {
    return { trainer: null, error: null, usedApi: false }
  }

  const data = await parseJson(res)
  if (!res.ok) {
    return { trainer: null, error: new Error(data?.error ? String(data.error) : `Ошибка ${res.status}`), usedApi: true }
  }
  return { trainer: data.trainer ?? null, error: null, usedApi: true }
}
