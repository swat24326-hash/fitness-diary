import { getAccessTokenForAdminApi } from './adminApiClient.js'

function apiUrl(action) {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/admin-data?action=${action}`
  }
  return `/api/admin-data?action=${action}`
}

async function postTrainerAuthAction(action, body) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора — войдите снова')

  const res = await fetch(apiUrl(action), {
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
    data = { error: text.slice(0, 200) || 'Ошибка сервера' }
  }

  if (!res.ok) {
    throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  }

  return data
}

/**
 * @param {{ trainer_id: string, password: string }} body
 */
export async function resetTrainerPasswordForAdmin(body) {
  return postTrainerAuthAction('reset-trainer-password', body)
}

/**
 * @param {{ trainer_id: string, is_active: boolean }} body
 */
export async function setTrainerActiveForAdmin(body) {
  return postTrainerAuthAction('set-trainer-active', body)
}

/**
 * @param {{ trainer_id: string, uses_tablet: boolean }} body
 */
export async function setTrainerUsesTabletForAdmin(body) {
  return postTrainerAuthAction('set-trainer-uses-tablet', body)
}
