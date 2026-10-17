/** Оценки клиентов для админа / управляющего: GET /api/admin-data?action=client-ratings. */
import { inboxApiCall } from '../inbox/inboxAdminApiClient.js'

export function fetchAdminClientRatings() {
  return inboxApiCall('client-ratings', 'GET', { view: 'list' })
}

export function fetchAdminClientRating(id) {
  return inboxApiCall('client-ratings', 'GET', { view: 'detail', id: String(id ?? '') })
}
