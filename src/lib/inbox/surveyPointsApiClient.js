/** Баллы клиента за опросы на стойке: admin-data?action=survey-points. Только онлайн, не sync_queue. */
import { inboxApiCall } from './inboxAdminApiClient.js'

export function fetchSurveyPoints(clientId) {
  return inboxApiCall('survey-points', 'GET', { client_id: String(clientId ?? '') })
}

/** @param {{ clientId: string, points: number, expectedBalance: number, comment: string }} r */
export function redeemSurveyPoints(r) {
  return inboxApiCall(
    'survey-points',
    'POST',
    {},
    { client_id: r.clientId, points: r.points, expected_balance: r.expectedBalance, comment: r.comment },
  )
}
