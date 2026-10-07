/**
 * GET /api/client-me — данные клиента для /me. Только токен клиента, только свой client_id.
 * GET /api/client-me?manifest=<club uuid>[&h=<token>] — публичный manifest с названием клуба (браузер шлёт без токена);
 *   h — вход значка на iPhone: попадает в start_url, в базе не проверяется (это делает /api/client-auth).
 * POST /api/client-me { action: 'push-*' } — напоминания о тренировке на этот телефон (clientPushHandler.js).
 * POST /api/client-me { action: 'handoff' } — одноразовый вход для значка на iPhone (clientHandoffHandler.js).
 */
import { sendJson, setCors } from '../adminSupabase.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { clientHandoffStartUrl, isClientHandoffToken } from './clientHandoffCore.js'
import { handleClientHandoff } from './clientHandoffHandler.js'
import { buildClientManifest, isClientManifestClubId } from './clientManifestCore.js'
import { handleClientPushPost } from './clientPushHandler.js'
import { loadClientMe } from './clientMeQuery.js'
import { requireClientUser } from './requireClientUser.js'

async function sendClientManifest(res, clubId, handoff) {
  const { data, error } = await createServiceDataClient().from('clubs').select('name').eq('id', clubId).maybeSingle()
  if (error) throw error
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  res.setHeader('Cache-Control', handoff ? 'no-store' : 'public, max-age=3600')
  res.end(JSON.stringify(buildClientManifest(data?.name, clientHandoffStartUrl(handoff))))
}

function parseBody(body) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

export async function clientMeHandler(req, res) {
  setCors(res, 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  const manifestClub = req.method === 'GET' ? req.query?.manifest : null
  if (manifestClub != null) {
    const handoff = req.query?.h
    if (!isClientManifestClubId(manifestClub) || (handoff != null && !isClientHandoffToken(handoff))) {
      sendJson(res, 400, { error: 'Неверный клуб' })
      return
    }
    await sendClientManifest(res, String(manifestClub).trim(), handoff ?? null)
    return
  }
  const ctx = await requireClientUser(req, res)
  if (!ctx) return
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'POST') {
    const body = parseBody(req.body)
    if (body?.action === 'handoff') await handleClientHandoff(ctx, res)
    else await handleClientPushPost(createServiceDataClient(), ctx, body, res)
    return
  }
  sendJson(res, 200, await loadClientMe(createServiceDataClient(), ctx.client))
}
