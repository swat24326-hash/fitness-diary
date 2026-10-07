/** GET /api/client-me — данные клиента для /me. Только токен клиента, только свой client_id. */
import { sendJson, setCors } from '../adminSupabase.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { loadClientMe } from './clientMeQuery.js'
import { requireClientUser } from './requireClientUser.js'

export async function clientMeHandler(req, res) {
  setCors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  const ctx = await requireClientUser(req, res)
  if (!ctx) return
  res.setHeader('Cache-Control', 'no-store')
  sendJson(res, 200, await loadClientMe(createServiceDataClient(), ctx.client))
}
