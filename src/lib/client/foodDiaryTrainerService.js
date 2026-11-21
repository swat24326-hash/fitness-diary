import { getAccessTokenForAdminApi } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

/**
 * Сводка дневника клиента для тренера (admin-data).
 * @param {{ clientId: string, date?: string }} opts
 */
export async function fetchClientFoodDiaryDay({ clientId, date }) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const params = new URLSearchParams({
    action: 'food-diary-client',
    client_id: String(clientId),
  })
  if (date) params.set('date', String(date).slice(0, 10))
  const res = await fetchWithAppTimeout(`/api/admin-data?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить дневник')
  return data
}

/** Список клиентов тренера за день (факт vs рацион). */
export async function fetchFoodDiaryRoster({ date } = {}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const params = new URLSearchParams({ action: 'food-diary-roster' })
  if (date) params.set('date', String(date).slice(0, 10))
  const res = await fetchWithAppTimeout(`/api/admin-data?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить питание клиентов')
  return data
}
