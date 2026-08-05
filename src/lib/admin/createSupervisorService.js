import { getAccessTokenForAdminApi } from './adminApiClient.js'

function createSupervisorApiUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/admin-data?action=create-supervisor`
  }
  return '/api/admin-data?action=create-supervisor'
}

/**
 * @param {{ name: string, login: string, password: string, club_id: string, email?: string, phone?: string }} body
 */
export async function createSupervisorForAdmin(body) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')

  const res = await fetch(createSupervisorApiUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text.slice(0, 200) }
  }

  if (!res.ok) {
    throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  }

  return data
}
