import { supabase } from '../supabase'
import { sleep } from '../supabaseRetry'

async function parseJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

export function apiRouteMissing(res, contentType) {
  const ct = contentType || ''
  if (ct.includes('text/html')) return true
  if (res.status === 404 || res.status === 405) return true
  return false
}

/** API на том же домене; JWT тренера или администратора. */
export async function getAccessTokenForAdminApi() {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession()
    session = refreshed.data?.session ?? null
  }
  return session?.access_token ?? null
}

/**
 * GET /api/list-trainers — null только если маршрута нет (старый деплой без api/).
 * Сеть / 401 / 500 — бросаем ошибку (не откатываемся в браузерный Supabase).
 * @returns {Promise<{ trainers: object[], clubColumn: boolean } | null>}
 */
export async function fetchTrainersViaAdminApi() {
  const token = await getAccessTokenForAdminApi()
  if (!token) {
    throw new Error('Нет сессии — выйдите и войдите снова как администратор, затем обновите страницу (Ctrl+F5).')
  }

  const url = `${apiOrigin()}/api/list-trainers`
  const headers = { Authorization: `Bearer ${token}` }
  let lastErr

  for (let attempt = 0; attempt < 3; attempt++) {
    let res
    try {
      res = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
      })
    } catch (e) {
      lastErr = e
      const msg = String(e?.message ?? e ?? '')
      if (attempt < 2) {
        await sleep(400 * (attempt + 1))
        continue
      }
      throw new Error(
        `Не удалось открыть ${url} (${msg}). Проверьте связь и что сайт открыт с https://fitness-diary-bice.vercel.app — после деплоя сделайте жёсткое обновление (Ctrl+F5).`,
      )
    }

    const contentType = res.headers.get('content-type') || ''
    const data = await parseJsonResponse(res)

    if (res.ok) {
      const trainers = Array.isArray(data.trainers) ? data.trainers : []
      if (trainers.length > 0 && typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem('fit-admin-trainers-cache', JSON.stringify(trainers))
        } catch {
          /* ignore */
        }
      }
      return {
        trainers,
        clubColumn: data.clubColumn !== false,
        count: typeof data.count === 'number' ? data.count : trainers.length,
      }
    }

    if (apiRouteMissing(res, contentType)) {
      return null
    }

    if (res.status === 401) {
      throw new Error(data?.error ? String(data.error) : 'Сессия недействительна — войдите снова.')
    }

    if (attempt < 2 && (res.status === 502 || res.status === 503 || res.status === 504)) {
      await sleep(500 * (attempt + 1))
      continue
    }

    throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  }

  throw lastErr ?? new Error('Не удалось загрузить список тренеров')
}

/**
 * GET /api/list-clients?club_id=… — null если маршрута нет.
 * @returns {Promise<{ clients: object[], count: number } | null>}
 */
export async function fetchClientsForClubViaAdminApi(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null

  const token = await getAccessTokenForAdminApi()
  if (!token) {
    throw new Error('Нет сессии администратора — войдите снова.')
  }

  const url = `${apiOrigin()}/api/list-clients?club_id=${encodeURIComponent(cid)}`
  const headers = { Authorization: `Bearer ${token}` }
  let lastErr

  for (let attempt = 0; attempt < 3; attempt++) {
    let res
    try {
      res = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
      })
    } catch (e) {
      lastErr = e
      if (attempt < 2) {
        await sleep(400 * (attempt + 1))
        continue
      }
      throw new Error(e?.message ?? 'Сеть')
    }

    const contentType = res.headers.get('content-type') || ''
    const data = await parseJsonResponse(res)

    if (res.ok) {
      return {
        clients: Array.isArray(data.clients) ? data.clients : [],
        count: typeof data.count === 'number' ? data.count : (data.clients?.length ?? 0),
      }
    }

    if (apiRouteMissing(res, contentType)) return null

    if (res.status === 401) {
      throw new Error(data?.error ? String(data.error) : 'Сессия недействительна — войдите снова.')
    }

    if (attempt < 2 && (res.status === 502 || res.status === 503 || res.status === 504)) {
      await sleep(500 * (attempt + 1))
      continue
    }

    throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  }

  throw lastErr ?? new Error('Не удалось загрузить клиентов')
}

/**
 * GET /api/list-memberships?club_id=… — null если маршрута нет.
 * @returns {Promise<{ memberships: object[], count: number } | null>}
 */
export async function fetchMembershipsForClubViaAdminApi(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null

  const token = await getAccessTokenForAdminApi()
  if (!token) {
    throw new Error('Нет сессии администратора — войдите снова.')
  }

  let res
  try {
    res = await fetch(`${apiOrigin()}/api/list-memberships?club_id=${encodeURIComponent(cid)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch (e) {
    throw new Error(e?.message ?? 'Сеть')
  }

  const contentType = res.headers.get('content-type') || ''
  const data = await parseJsonResponse(res)

  if (res.ok) {
    return {
      memberships: Array.isArray(data.memberships) ? data.memberships : [],
      count: typeof data.count === 'number' ? data.count : (data.memberships?.length ?? 0),
    }
  }

  if (apiRouteMissing(res, contentType)) return null

  throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
}

/**
 * GET /api/get-client?client_id=… — null если маршрута нет.
 * @returns {Promise<{ client: object, memberships: object[], health_card: object | null, body_measurements: object[], trainings: object[] } | null>}
 */
export async function fetchClientWorkspaceViaAdminApi(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return null

  const token = await getAccessTokenForAdminApi()
  if (!token) {
    throw new Error('Нет сессии — войдите снова.')
  }

  let res
  try {
    res = await fetch(`${apiOrigin()}/api/get-client?client_id=${encodeURIComponent(cid)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch (e) {
    throw new Error(e?.message ?? 'Сеть')
  }

  const contentType = res.headers.get('content-type') || ''
  const data = await parseJsonResponse(res)

  if (res.ok) {
    return {
      client: data.client ?? null,
      memberships: Array.isArray(data.memberships) ? data.memberships : [],
      health_card: data.health_card ?? null,
      body_measurements: Array.isArray(data.body_measurements) ? data.body_measurements : [],
      trainings: Array.isArray(data.trainings) ? data.trainings : [],
    }
  }

  if (apiRouteMissing(res, contentType)) return null

  if (res.status === 404) {
    return { notFound: true }
  }

  throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
}

async function adminApiGet(path, token) {
  let res
  try {
    res = await fetch(`${apiOrigin()}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch (e) {
    throw new Error(e?.message ?? 'Сеть')
  }
  const contentType = res.headers.get('content-type') || ''
  const data = await parseJsonResponse(res)
  if (res.ok) return { data, routeMissing: false }
  if (apiRouteMissing(res, contentType)) return { data: null, routeMissing: true }
  throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
}

/** GET /api/search-clients */
export async function searchClientsViaAdminApi({ query, clubId, limit = 50 }) {
  const q = String(query ?? '').trim()
  if (q.length < 2) return { clients: [] }

  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')

  const params = new URLSearchParams({ q, limit: String(limit) })
  if (clubId) params.set('club_id', clubId)

  const { data, routeMissing } = await adminApiGet(`/api/admin-data?action=search&${params}`, token)
  if (routeMissing) return null
  return { clients: Array.isArray(data.clients) ? data.clients : [] }
}

/** GET /api/admin-journal */
export async function fetchAdminJournalViaApi({ page, pageSize, filters }) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  const f = filters ?? {}
  if (f.clubId) params.set('club_id', f.clubId)
  if (f.trainerId) params.set('trainer_id', f.trainerId)
  if (f.clientId) params.set('client_id', f.clientId)
  if (f.status) params.set('status', f.status)
  if (f.dateFrom) params.set('date_from', f.dateFrom)
  if (f.dateTo) params.set('date_to', f.dateTo)

  const { data, routeMissing } = await adminApiGet(`/api/admin-data?action=journal&${params}`, token)
  if (routeMissing) return null
  return {
    trainings: Array.isArray(data.trainings) ? data.trainings : [],
    clientsById: data.clientsById ?? {},
    totalCount: typeof data.totalCount === 'number' ? data.totalCount : 0,
  }
}

/** GET /api/club-training-stats */
export async function fetchClubTrainingStatsViaApi({ clubId, dateFrom, dateTo }) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')

  const params = new URLSearchParams({
    club_id: clubId,
    date_from: dateFrom,
    date_to: dateTo,
  })
  const { data, routeMissing } = await adminApiGet(`/api/admin-data?action=club-stats&${params}`, token)
  if (routeMissing) return null
  return data
}

/** GET /api/admin-data?action=club-monthly */
export async function fetchClubMonthlyStatsViaApi({ clubId, anchorTo, months = 12 }) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')

  const params = new URLSearchParams({
    club_id: clubId,
    anchor_to: String(anchorTo ?? '').slice(0, 10),
    months: String(months),
  })
  const { data, routeMissing } = await adminApiGet(`/api/admin-data?action=club-monthly&${params}`, token)
  if (routeMissing) return null
  return data
}

/** GET /api/admin-data?action=challenge-trainings — тренировки клуба за период (для рейтинга челленджа). */
export async function fetchChallengeTrainingsViaApi(clubId, dateFrom, dateTo) {
  const cid = String(clubId ?? '').trim()
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!cid || !from || !to) return null

  const token = await getAccessTokenForAdminApi()
  if (!token) return null

  const params = new URLSearchParams({
    action: 'challenge-trainings',
    club_id: cid,
    date_from: from,
    date_to: to,
  })
  const { data, routeMissing } = await adminApiGet(`/api/admin-data?${params}`, token)
  if (routeMissing) return null
  return {
    trainings: Array.isArray(data.trainings) ? data.trainings : [],
    count: typeof data.count === 'number' ? data.count : 0,
  }
}

/** GET /api/list-challenges */
export async function fetchChallengesForClubViaApi(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null

  const token = await getAccessTokenForAdminApi()
  if (!token) {
    throw new Error('Нет сессии — выйдите и войдите снова, затем нажмите Sync.')
  }

  const { data, routeMissing } = await adminApiGet(
    `/api/admin-data?action=challenges&club_id=${encodeURIComponent(cid)}`,
    token,
  )
  if (routeMissing) return null
  return {
    challenges: Array.isArray(data.challenges) ? data.challenges : [],
    count: typeof data.count === 'number' ? data.count : 0,
  }
}

/** GET /api/admin-data?action=clubs */
export async function fetchClubsViaAdminApi() {
  const token = await getAccessTokenForAdminApi()
  if (!token) return null

  const { data, routeMissing } = await adminApiGet('/api/admin-data?action=clubs', token)
  if (routeMissing) return null
  return {
    clubs: Array.isArray(data.clubs) ? data.clubs : [],
    count: typeof data.count === 'number' ? data.count : 0,
  }
}

/** GET /api/admin-data?action=membership-types&club_id=… */
export async function fetchMembershipTypesForClubViaApi(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null

  const token = await getAccessTokenForAdminApi()
  if (!token) {
    throw new Error('Нет сессии — выйдите и войдите снова, затем нажмите Sync.')
  }

  const { data, routeMissing } = await adminApiGet(
    `/api/admin-data?action=membership-types&club_id=${encodeURIComponent(cid)}`,
    token,
  )
  if (routeMissing) return null
  return {
    membership_types: Array.isArray(data.membership_types) ? data.membership_types : [],
    count: typeof data.count === 'number' ? data.count : 0,
  }
}

/** GET /api/admin-data?action=exercises-meta — лёгкая проверка «нужен ли pull». */
export async function fetchExercisesMetaViaApi() {
  const token = await getAccessTokenForAdminApi()
  if (!token) return null

  const { data, routeMissing } = await adminApiGet('/api/admin-data?action=exercises-meta', token)
  if (routeMissing) return null
  return {
    count: typeof data.count === 'number' ? data.count : 0,
    max_created_at: data.max_created_at ?? null,
  }
}

/** GET /api/admin-data?action=exercises */
export async function fetchExercisesViaApi() {
  const token = await getAccessTokenForAdminApi()
  if (!token) return null

  const { data, routeMissing } = await adminApiGet('/api/admin-data?action=exercises', token)
  if (routeMissing) return null
  return {
    exercises: Array.isArray(data.exercises) ? data.exercises : [],
    count: typeof data.count === 'number' ? data.count : 0,
    max_created_at: data.max_created_at ?? null,
  }
}
