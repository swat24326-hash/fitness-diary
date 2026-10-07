import { sendJson } from '../adminSupabase.js'
import {
  CLIENT_SESSION_RU,
  CLIENT_TOKEN_TYP,
  bearerFromHeaders,
  clientPortalSecret,
  clientSessionDenial,
  readClientToken,
} from './clientAuthCore.js'
import { clientPortalStore } from './clientPortalStore.js'

/**
 * Только токен клиента (typ 'client'). Сессию и архив сверяем на каждый запрос —
 * «Отключить все входы» и архивация действуют сразу, а не через час.
 * @returns {Promise<{ clientId: string, sid: string, client: object } | null>}
 */
export async function requireClientUser(req, res, store = clientPortalStore) {
  const secret = clientPortalSecret()
  if (!secret) {
    sendJson(res, 503, { error: 'Вход клиентов не настроен на сервере' })
    return null
  }
  const tok = readClientToken(bearerFromHeaders(req.headers), CLIENT_TOKEN_TYP, secret)
  if (!tok) {
    sendJson(res, 401, { error: CLIENT_SESSION_RU })
    return null
  }
  const [session, client] = await Promise.all([store.loadSession(tok.sid), store.loadClient(tok.clientId)])
  if (clientSessionDenial({ session, client, clientId: tok.clientId })) {
    sendJson(res, 401, { error: CLIENT_SESSION_RU })
    return null
  }
  return { clientId: tok.clientId, sid: tok.sid, client }
}
