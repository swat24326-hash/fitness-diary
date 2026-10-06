import { sendJson, setCors } from './adminSupabase.js'
import { isOwnAuthProvider, ownAuthEnvError } from './authOwnCore.js'
import { logoutOwnSession, refreshOwnSession, signInWithPasswordOwn, verifyBearerOwn } from './authPortOwn.js'
import { ownLogoutScope } from './authSessionsCore.js'
import { authFailLimiter, authRateLimitedMessageRu, clientIpFromHeaders } from './authRateLimitCore.js'

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
 * @param {{ loadUserById?: Parameters<typeof refreshOwnSession>[1], sessions?: Parameters<typeof refreshOwnSession>[2] }} [deps]
 */
export async function handleAuthV1(req, res, deps = {}) {
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
    // Всегда 204: supabase-js не стирает локальную сессию при ошибке, выход на планшете важнее отзыва.
    const header = String(req.headers.authorization || req.headers.Authorization || '')
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const tokens = [body.refresh_token, header.startsWith('Bearer ') ? header.slice(7).trim() : ''].filter(Boolean)
    const out = await logoutOwnSession(tokens, ownLogoutScope(req.query?.scope), deps.sessions)
    if (out.error) console.warn('[auth-v1] logout:', out.error)
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
      const { session, error, transient } = await refreshOwnSession(body.refresh_token, deps.loadUserById, deps.sessions)
      if (transient) {
        // supabase-js стирает сессию на 4xx/500 и повторяет только 502–504.
        console.error('[auth-v1] refresh: база недоступна', error)
        sendJson(res, 503, { error: 'temporarily_unavailable', msg: 'Сервер занят — повторите через минуту' })
        return
      }
      if (error || !session) {
        gotrueError(res, 400, error || 'Сессия недействительна — войдите снова')
        return
      }
      sendJson(res, 200, { ...session })
      return
    }
    if (grant === 'password') {
      const ip = clientIpFromHeaders(req.headers, req.remoteAddress ?? req.socket?.remoteAddress)
      const gate = authFailLimiter.check(body.email, ip)
      if (!gate.ok) {
        res.setHeader('Retry-After', String(gate.retryAfterSec))
        gotrueError(res, 429, authRateLimitedMessageRu(gate.retryAfterSec))
        return
      }
      const { session, error } = await signInWithPasswordOwn('', '', {
        email: body.email,
        password: body.password,
      })
      if (error || !session) {
        authFailLimiter.recordOutcome(body.email, ip, /заблокирован/i.test(String(error ?? '')) ? 403 : 401)
        gotrueError(res, 400, error || 'Неверный логин или пароль')
        return
      }
      authFailLimiter.recordOutcome(body.email, ip, 200)
      sendJson(res, 200, { ...session })
      return
    }
    gotrueError(res, 400, 'Неподдерживаемый grant_type')
    return
  }

  sendJson(res, 404, { error: 'not_found' })
}
