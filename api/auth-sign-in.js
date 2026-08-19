/**
 * Вход через сервер API (обход ERR_CONNECTION_RESET браузер → Auth).
 * POST { login, password } — login может быть email или логин из users.login.
 *
 * При недоступности PostgREST сначала пробуем Auth напрямую (login@trainer.local / email),
 * чтобы не зависать на lookup в users.
 */
import { createClient } from '@supabase/supabase-js'
import { readEnv, sendJson, setCors } from './_lib/adminSupabase.js'
import { AUTH_ENV_MISSING_RU, signInWithPassword } from './_lib/authPort.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { emailFromLoginRow, normalizeLoginInput, trainerLocalEmail } from './_lib/authLoginResolveCore.js'
import { createFetchWithTimeout, isServerTimeoutError, withServerTimeout } from './_lib/serverFetchTimeout.js'
import {
  SUPABASE_CLOUD_UNAVAILABLE_RU,
  buildDirectAuthEmailCandidates,
  isInvalidCredentialsMessage,
} from '../src/lib/authSignInCore.js'

const SUPABASE_FETCH_MS = 8000

async function resolveEmail(supabaseAdmin, raw) {
  const trimmed = normalizeLoginInput(raw)
  if (!trimmed) return null
  if (trimmed.includes('@')) {
    const row = await supabaseAdmin.from('users').select('email, is_active').ilike('email', trimmed).maybeSingle()
    const picked = emailFromLoginRow(row.data, trimmed)
    return picked ?? { email: trimmed, isActive: row.data?.is_active !== false }
  }

  const loginLower = trimmed.toLowerCase()
  const synthEmail = trainerLocalEmail(trimmed)

  const attempts = [
    () => supabaseAdmin.from('users').select('email, is_active').eq('login', loginLower).maybeSingle(),
    () => supabaseAdmin.from('users').select('email, is_active').ilike('login', trimmed).maybeSingle(),
  ]
  if (synthEmail) {
    attempts.push(() => supabaseAdmin.from('users').select('email, is_active').ilike('email', synthEmail).maybeSingle())
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

async function tryAuthAndRespond(res, { url, anonKey, supabaseAdmin, email, password, fetchWithTimeout }) {
  const { session, user: authUser, error: authErr } = await withServerTimeout(
    signInWithPassword(url, anonKey, { email, password }, { fetch: fetchWithTimeout }),
    SUPABASE_FETCH_MS,
    'auth',
  )

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

  const { url, serviceKey, anonKey } = readEnv()
  if (!url || !serviceKey || !anonKey) {
    sendJson(res, 500, { error: AUTH_ENV_MISSING_RU })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
  }

  const login = String(body?.login ?? '').trim()
  const password = String(body?.password ?? '')
  if (!login || !password) {
    sendJson(res, 400, { error: 'Введите логин и пароль' })
    return
  }

  const fetchWithTimeout = createFetchWithTimeout(SUPABASE_FETCH_MS)
  const supabaseAdmin = createClient(url, serviceKey, { global: { fetch: fetchWithTimeout } })

  const directCandidates = buildDirectAuthEmailCandidates(login)
  let sawTransportError = false
  let sawInvalidCredentials = false

  for (const email of directCandidates) {
    try {
      const attempt = await tryAuthAndRespond(res, {
        url,
        anonKey,
        supabaseAdmin,
        email,
        password,
        fetchWithTimeout,
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

  if (directCandidates.length === 1 && directCandidates[0].includes('@') && sawInvalidCredentials && !sawTransportError) {
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
    sendJson(res, 401, {
      error: 'Пользователь с таким логином не найден. Проверьте раскладку или войдите по email.',
    })
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

export default withSafeApiHandler(handler, { label: 'auth-sign-in' })
