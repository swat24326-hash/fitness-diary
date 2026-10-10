/**
 * Вход через сервер API (обход ERR_CONNECTION_RESET браузер → Auth).
 * POST { login, password } — login может быть email или логин из users.login.
 *
 * При недоступности PostgREST сначала пробуем Auth напрямую (login@trainer.local / email),
 * чтобы не зависать на lookup в users.
 */
import { readEnv, sendJson, setCors } from './_lib/adminSupabase.js'
import { createServiceDataClient } from './_lib/pgRest/serviceClient.js'
import { authRuntimeEnvError, signInWithPassword } from './_lib/authPort.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { deviceIdFromHeaders } from './_lib/deviceBindingGate.js'
import { authFailLimiter, authRateLimitedMessageRu, clientIpFromHeaders } from './_lib/authRateLimitCore.js'
import { emailFromLoginRow, normalizeLoginInput, normalizePasswordInput, trainerLocalEmail } from './_lib/authLoginResolveCore.js'
import { createFetchWithTimeout, isServerTimeoutError, withServerTimeout } from './_lib/serverFetchTimeout.js'
import {
  SUPABASE_CLOUD_UNAVAILABLE_RU,
  buildDirectAuthEmailCandidates,
  isInvalidCredentialsMessage,
} from '../src/lib/authSignInCore.js'
import { ilikeExactPattern } from '../src/lib/ilikeExactCore.js'

const SUPABASE_FETCH_MS = 8000

async function resolveEmail(supabaseAdmin, raw) {
  const trimmed = normalizeLoginInput(raw)
  if (!trimmed) return null
  if (trimmed.includes('@')) {
    const emailPattern = ilikeExactPattern(trimmed)
    const row = emailPattern
      ? await supabaseAdmin.from('users').select('email, is_active').ilike('email', emailPattern).maybeSingle()
      : { data: null }
    const picked = emailFromLoginRow(row.data, trimmed)
    return picked ?? { email: trimmed, isActive: row.data?.is_active !== false }
  }

  const loginLower = trimmed.toLowerCase()
  const synthEmail = trainerLocalEmail(trimmed)
  const loginPattern = ilikeExactPattern(trimmed)
  const synthEmailPattern = ilikeExactPattern(synthEmail)

  const attempts = [
    () => supabaseAdmin.from('users').select('email, is_active').eq('login', loginLower).maybeSingle(),
  ]
  if (loginPattern) {
    attempts.push(() => supabaseAdmin.from('users').select('email, is_active').ilike('login', loginPattern).maybeSingle())
  }
  if (synthEmailPattern) {
    attempts.push(() =>
      supabaseAdmin.from('users').select('email, is_active').ilike('email', synthEmailPattern).maybeSingle(),
    )
  }

  for (const run of attempts) {
    const { data } = await run()
    const picked = emailFromLoginRow(data, trimmed)
    if (picked) return picked
  }

  if (synthEmail) {
    return { email: synthEmail, isActive: true }
  }

  return null
}

async function fetchProfile(supabaseAdmin, uid) {
  if (!uid) return null
  try {
    const full = await withServerTimeout(
      supabaseAdmin.from('users').select('role, name, email, phone, login, club_id').eq('id', uid).maybeSingle(),
      SUPABASE_FETCH_MS,
      'profile',
    )
    if (!full.error && full.data) return full.data
    const basic = await withServerTimeout(
      supabaseAdmin.from('users').select('role, name, email, phone, login').eq('id', uid).maybeSingle(),
      SUPABASE_FETCH_MS,
      'profile-basic',
    )
    if (!basic.error && basic.data) return { ...basic.data, club_id: null }
  } catch (e) {
    if (!isServerTimeoutError(e)) throw e
  }
  return null
}

async function tryAuthAndRespond(res, { url, anonKey, supabaseAdmin, email, password, fetchWithTimeout, device }) {
  const { session, user: authUser, error: authErr, code } = await withServerTimeout(
    signInWithPassword(url, anonKey, { email, password, ...device }, { fetch: fetchWithTimeout }),
    SUPABASE_FETCH_MS,
    'auth',
  )

  // Пароль верный, устройство тренера не разрешено — ответ окончательный, другие email не пробуем.
  if (code === 'busy') {
    sendJson(res, 503, { error: authErr })
    return { ok: true }
  }
  if (code) {
    sendJson(res, 403, { error: authErr, code })
    return { ok: true }
  }

  if (authErr || !session) {
    return { ok: false, error: authErr, transport: !authErr || !isInvalidCredentialsMessage(authErr) }
  }

  const profile = await fetchProfile(supabaseAdmin, authUser?.id)
  sendJson(res, 200, {
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
    },
    user: authUser,
    profile,
  })
  return { ok: true }
}

async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const envErr = authRuntimeEnvError()
  if (envErr) {
    sendJson(res, 500, { error: envErr })
    return
  }
  const { url, anonKey } = readEnv()

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
  }

  const login = normalizeLoginInput(body?.login)
  const password = normalizePasswordInput(body?.password)
  if (!login || !password) {
    sendJson(res, 400, { error: 'Введите логин и пароль' })
    return
  }

  const device = { deviceId: deviceIdFromHeaders(req.headers), userAgent: String(req.headers?.['user-agent'] ?? '') }
  const fetchWithTimeout = createFetchWithTimeout(SUPABASE_FETCH_MS)
  const supabaseAdmin = createServiceDataClient({ global: { fetch: fetchWithTimeout } })

  let sawTransportError = false
  let sawInvalidCredentials = false

  // Короткий логин: сначала email из users (admin@fit-city.ru, sales@sales.local…), не synth-домены.
  if (!login.includes('@')) {
    let resolvedEarly = null
    try {
      resolvedEarly = await withServerTimeout(resolveEmail(supabaseAdmin, login), SUPABASE_FETCH_MS, 'resolveEmail')
    } catch (e) {
      if (isServerTimeoutError(e)) {
        sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
        return
      }
      throw e
    }
    if (resolvedEarly?.email) {
      if (resolvedEarly.isActive === false) {
        sendJson(res, 403, { error: 'Учётная запись заблокирована' })
        return
      }
      try {
        const attempt = await tryAuthAndRespond(res, {
          url,
          anonKey,
          supabaseAdmin,
          email: String(resolvedEarly.email).trim(),
          password,
          fetchWithTimeout,
          device,
        })
        if (attempt.ok) return
        if (attempt.transport) {
          sawTransportError = true
        } else if (isInvalidCredentialsMessage(attempt.error)) {
          sendJson(res, 401, { error: 'Неверный логин или пароль' })
          return
        } else {
          sendJson(res, 400, { error: String(attempt.error ?? 'Ошибка входа') })
          return
        }
      } catch (e) {
        if (isServerTimeoutError(e)) {
          sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
          return
        }
        throw e
      }
    }
  }

  const directCandidates = buildDirectAuthEmailCandidates(login)

  for (const email of directCandidates) {
    try {
      const attempt = await tryAuthAndRespond(res, {
        url,
        anonKey,
        supabaseAdmin,
        email,
        password,
        fetchWithTimeout,
        device,
      })
      if (attempt.ok) return
      if (attempt.transport) {
        sawTransportError = true
      } else if (isInvalidCredentialsMessage(attempt.error)) {
        sawInvalidCredentials = true
      }
    } catch (e) {
      if (isServerTimeoutError(e)) {
        sawTransportError = true
      } else {
        throw e
      }
    }
  }

  if (sawTransportError && directCandidates.length > 0) {
    sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
    return
  }

  // Email введён целиком — если пароль неверный, пробуем канонический email из users (регистр).
  if (login.includes('@') && sawInvalidCredentials && !sawTransportError) {
    let resolvedEmail = null
    try {
      resolvedEmail = await withServerTimeout(resolveEmail(supabaseAdmin, login), SUPABASE_FETCH_MS, 'resolveEmail')
    } catch (e) {
      if (isServerTimeoutError(e)) {
        sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
        return
      }
      throw e
    }
    const canonical = String(resolvedEmail?.email ?? '').trim()
    if (
      canonical &&
      resolvedEmail?.isActive !== false &&
      canonical.toLowerCase() !== login.toLowerCase() &&
      !directCandidates.includes(canonical)
    ) {
      try {
        const attempt = await tryAuthAndRespond(res, {
          url,
          anonKey,
          supabaseAdmin,
          email: canonical,
          password,
          fetchWithTimeout,
          device,
        })
        if (attempt.ok) return
        if (attempt.transport || isServerTimeoutError(attempt.error)) {
          sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
          return
        }
      } catch (e) {
        if (isServerTimeoutError(e)) {
          sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
          return
        }
        throw e
      }
    }
    sendJson(res, 401, { error: 'Неверный логин или пароль' })
    return
  }

  let resolved = null
  try {
    resolved = await withServerTimeout(resolveEmail(supabaseAdmin, login), SUPABASE_FETCH_MS, 'resolveEmail')
  } catch (e) {
    if (isServerTimeoutError(e) || sawTransportError) {
      sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
      return
    }
    throw e
  }

  if (!resolved?.email) {
    if (sawTransportError) {
      sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
      return
    }
    sendJson(res, 401, { error: 'Неверный логин или пароль' })
    return
  }

  if (resolved.isActive === false) {
    sendJson(res, 403, { error: 'Учётная запись заблокирована' })
    return
  }

  const emailForAuth = String(resolved.email).trim()
  if (directCandidates.includes(emailForAuth) && sawInvalidCredentials && !sawTransportError) {
    sendJson(res, 401, { error: 'Неверный логин или пароль' })
    return
  }

  try {
    const attempt = await tryAuthAndRespond(res, {
      url,
      anonKey,
      supabaseAdmin,
      email: emailForAuth,
      password,
      fetchWithTimeout,
      device,
    })
    if (attempt.ok) return
    if (attempt.transport || isServerTimeoutError(attempt.error)) {
      sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
      return
    }
    if (isInvalidCredentialsMessage(attempt.error)) {
      sendJson(res, 401, { error: 'Неверный логин или пароль' })
      return
    }
    sendJson(res, 400, { error: String(attempt.error ?? 'Ошибка входа') })
  } catch (e) {
    if (isServerTimeoutError(e)) {
      sendJson(res, 503, { error: SUPABASE_CLOUD_UNAVAILABLE_RU })
      return
    }
    throw e
  }
}

function parseLoginFromBody(body) {
  if (typeof body !== 'string') return normalizeLoginInput(body?.login)
  try {
    return normalizeLoginInput(JSON.parse(body)?.login)
  } catch {
    return ''
  }
}

async function rateLimitedHandler(req, res) {
  if (req.method !== 'POST') return handler(req, res)
  const login = parseLoginFromBody(req.body)
  const ip = clientIpFromHeaders(req.headers, req.remoteAddress ?? req.socket?.remoteAddress)
  const gate = authFailLimiter.check(login, ip)
  if (!gate.ok) {
    setCors(res, 'POST, OPTIONS')
    res.setHeader('Retry-After', String(gate.retryAfterSec))
    sendJson(res, 429, { error: authRateLimitedMessageRu(gate.retryAfterSec) })
    return
  }
  await handler(req, res)
  authFailLimiter.recordOutcome(login, ip, res.statusCode)
}

export default withSafeApiHandler(rateLimitedHandler, { label: 'auth-sign-in' })
