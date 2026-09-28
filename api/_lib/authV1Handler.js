import { sendJson, setCors } from './adminSupabase.js'
import { isOwnAuthProvider, ownAuthEnvError } from './authOwnCore.js'
import { refreshOwnSession, signInWithPasswordOwn, verifyBearerOwn } from './authPortOwn.js'

function gotrueError(res, status, message) {
  sendJson(res, status, {
    error: status === 401 ? 'invalid_token' : 'invalid_grant',
    error_description: message,
    msg: message,
  })
}

/**
 * Узкий кусок GoTrue: token, user, logout. Нужен, чтобы клиент supabase принял наш JWT,
 * когда адрес Auth смотрит на этот сервер. Пока AUTH_PROVIDER не own — 404.
 * @param {import('http').IncomingMessage & { query?: Record<string, string>, body?: unknown }} req
 * @param {import('http').ServerResponse} res
 */
export async function handleAuthV1(req, res) {
  setCors(res, 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, apikey, x-client-info')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (!isOwnAuthProvider()) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }
  const envErr = ownAuthEnvError()
  if (envErr) {
    sendJson(res, 500, { error: envErr, msg: envErr })
    return
  }

  const path = new URL(req.url || '/', 'http://localhost').pathname.replace(/\/+$/, '')
  if (path.endsWith('/logout') && req.method === 'POST') {
    res.statusCode = 204
    res.end()
    return
  }

  if (path.endsWith('/user') && req.method === 'GET') {
    const header = req.headers.authorization || req.headers.Authorization
    const token = String(header ?? '').startsWith('Bearer ') ? String(header).slice(7).trim() : ''
    const { user, error } = await verifyBearerOwn(token)
    if (error || !user) {
      gotrueError(res, 401, error || 'Сессия недействительна — войдите снова')
      return
    }
    sendJson(res, 200, user)
    return
  }

  if (path.endsWith('/token') && req.method === 'POST') {
    const grant = String(req.query?.grant_type ?? '')
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    if (grant === 'refresh_token') {
      const { session, error } = refreshOwnSession(body.refresh_token)
      if (error || !session) {
        gotrueError(res, 400, error || 'Сессия недействительна — войдите снова')
        return
      }
      sendJson(res, 200, { ...session })
      return
    }
    if (grant === 'password') {
      const { session, error } = await signInWithPasswordOwn('', '', {
        email: body.email,
        password: body.password,
      })
      if (error || !session) {
        gotrueError(res, 400, error || 'Неверный логин или пароль')
        return
      }
      sendJson(res, 200, { ...session })
      return
    }
    gotrueError(res, 400, 'Неподдерживаемый grant_type')
    return
  }

  sendJson(res, 404, { error: 'not_found' })
}
