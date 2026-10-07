/**
 * GET /api/client-me — данные клиента для /me. Только токен клиента, только свой client_id.
 * GET /api/client-me?manifest=<club uuid> — публичный manifest с названием клуба (браузер шлёт без токена).
 */
import { sendJson, setCors } from '../adminSupabase.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { buildClientManifest, isClientManifestClubId } from './clientManifestCore.js'
import { loadClientMe } from './clientMeQuery.js'
import { requireClientUser } from './requireClientUser.js'

async function sendClientManifest(res, clubId) {
  const { data, error } = await createServiceDataClient().from('clubs').select('name').eq('id', clubId).maybeSingle()
  if (error) throw error
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.end(JSON.stringify(buildClientManifest(data?.name)))
}

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
  const manifestClub = req.query?.manifest
  if (manifestClub != null) {
    if (!isClientManifestClubId(manifestClub)) {
      sendJson(res, 400, { error: 'Неверный клуб' })
      return
    }
    await sendClientManifest(res, String(manifestClub).trim())
    return
  }
  const ctx = await requireClientUser(req, res)
  if (!ctx) return
  res.setHeader('Cache-Control', 'no-store')
  sendJson(res, 200, await loadClientMe(createServiceDataClient(), ctx.client))
}
