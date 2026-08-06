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
 * Подправить имя в sessionStorage-кэше списка тренеров (другие экраны админки).
 * @param {string} trainerId
 * @param {string} name
 */
export function patchTrainerNameInAdminSessionCache(trainerId, name) {
  const tid = String(trainerId ?? '').trim()
  const nextName = String(name ?? '').trim()
  if (!tid || !nextName || typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem('fit-admin-trainers-cache')
    if (!raw) return
    const cached = JSON.parse(raw)
    if (!Array.isArray(cached) || cached.length === 0) return
    let changed = false
    const next = cached.map((row) => {
      if (String(row?.id ?? '') !== tid) return row
      changed = true
      return { ...row, name: nextName }
    })
    if (changed) sessionStorage.setItem('fit-admin-trainers-cache', JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ trainer_id: string, name: string }} body
 */
export async function setTrainerNameForAdmin(body) {
  return postTrainerAuthAction('set-trainer-name', body)
}

/**
 * @param {{ trainer_id: string, uses_tablet: boolean }} body
 */
export async function setTrainerUsesTabletForAdmin(body) {
  return postTrainerAuthAction('set-trainer-uses-tablet', body)
}

/**
 * Удаление тренера (Auth + users) через /api/admin-data?action=delete-trainer.
 * @param {string} trainerId
 */
export async function deleteTrainerViaAdminApi(trainerId) {
  return postTrainerAuthAction('delete-trainer', { trainer_id: trainerId })
}
