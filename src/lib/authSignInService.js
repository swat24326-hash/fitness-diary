import { supabase } from './supabase'
import { emailFromLoginRow, normalizeLoginInput, normalizePasswordInput, trainerLocalEmail } from './authLoginResolveCore.js'
import { buildDirectAuthEmailCandidates, isInvalidCredentialsMessage, SUPABASE_CLOUD_UNAVAILABLE_RU } from './authSignInCore.js'
import { firstSuccessfulPromise } from './networkReachability.js'
import { withFastTimeout } from './supabaseRetry.js'

export { isAuthApiTransportError } from './authSignInTransport.js'

/** Тот же порядок, что в /api/auth-sign-in (без service role в браузере). */
export async function resolveLoginEmailFromDb(raw) {
  const trimmed = normalizeLoginInput(raw)
  if (!trimmed) return { email: null, isActive: true, error: null }
  if (trimmed.includes('@')) return { email: trimmed, isActive: true, error: null }

  const loginLower = trimmed.toLowerCase()
  const synthEmail = trainerLocalEmail(trimmed)

  const attempts = [
    () => supabase.from('users').select('email, is_active').eq('login', loginLower).maybeSingle(),
    () => supabase.from('users').select('email, is_active').ilike('login', trimmed).maybeSingle(),
  ]
  if (synthEmail) {
    attempts.push(() => supabase.from('users').select('email, is_active').ilike('email', synthEmail).maybeSingle())
  }

  for (const run of attempts) {
    const { data, error } = await run()
    if (error) return { email: null, isActive: true, error }
    const picked = emailFromLoginRow(data, trimmed)
    if (picked) {
      return { email: picked.email, isActive: picked.isActive, error: null }
    }
  }

  if (synthEmail) {
    return { email: synthEmail, isActive: true, error: null }
  }

  return { email: null, isActive: true, error: null }
}

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function apiUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/auth-sign-in`
  }
  return '/api/auth-sign-in'
}

const AUTH_API_TIMEOUT_MS = 12_000

/**
 * Вход через /api/auth-sign-in (сервер → Supabase), затем setSession в браузере.
 * @returns {Promise<{ user: object, profile: object | null, error: Error | null, transportError?: boolean }>}
 */
export async function signInViaServerApi({ login, password }) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer =
    controller &&
    setTimeout(() => {
      controller.abort()
    }, AUTH_API_TIMEOUT_MS)

  const pwd = normalizePasswordInput(password)
  let res
  try {
    res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller?.signal,
      body: JSON.stringify({ login: normalizeLoginInput(login), password: pwd }),
    })
  } catch (e) {
    const msg =
      e?.name === 'AbortError'
        ? 'Таймаут сервера входа'
        : String(e?.message ?? 'Failed to fetch')
    return {
      user: null,
      profile: null,
      transportError: true,
      error: new Error(`Не удалось связаться с сервером входа. ${msg}`),
    }
  } finally {
    if (timer) clearTimeout(timer)
  }

  const data = await parseJson(res)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/html') || res.status === 404 || res.status === 405) {
    return { user: null, profile: null, error: null }
  }

  if (!res.ok) {
    if (res.status === 503) {
      return {
        user: null,
        profile: null,
        transportError: true,
        error: new Error(data?.error ? String(data.error) : SUPABASE_CLOUD_UNAVAILABLE_RU),
      }
    }
    return {
      user: null,
      profile: null,
      error: new Error(data?.error ? String(data.error) : `Ошибка входа (${res.status})`),
    }
  }

  const session = data?.session
  if (!session?.access_token || !session?.refresh_token) {
    return { user: null, profile: null, error: new Error('Сервер не вернул сессию') }
  }

  const { error: setErr } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (setErr) {
    return { user: null, profile: null, error: new Error(setErr.message) }
  }

  return {
    user: data.user ?? null,
    profile: data.profile ?? null,
    error: null,
  }
}

const DIRECT_AUTH_TIMEOUT_MS = 10_000

/** Прямой Auth из браузера (с таймаутом на зависший Supabase). */
export async function signInWithPasswordDirect(email, password, attempts = 2) {
  const pwd = normalizePasswordInput(password)
  let lastError = null
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await withFastTimeout(
        supabase.auth.signInWithPassword({ email, password: pwd }),
        DIRECT_AUTH_TIMEOUT_MS,
      )
      if (!error) return { data, error: null }
      lastError = error
      if (!isInvalidCredentialsMessage(error.message)) break
    } catch (e) {
      lastError = e
    }
    const msg = String(lastError?.message ?? lastError ?? '')
    const retryable = /failed to fetch|network|connection reset|err_connection|timeout|load failed/i.test(msg)
    if (!retryable || i === attempts - 1) break
    await new Promise((r) => setTimeout(r, 900 * (i + 1)))
  }
  return { data: null, error: lastError }
}

/**
 * Параллельно: /api/auth-sign-in и прямой Auth (email / login@trainer.local).
 * Первый успешный путь побеждает — не ждём 12 с API, если Auth отвечает быстрее.
 */
export async function raceSignInAttempts({ login, password }) {
  const raw = normalizeLoginInput(login)
  const pwd = normalizePasswordInput(password)
  const tasks = [
    async () => {
      const viaServer = await signInViaServerApi({ login: raw, password: pwd })
      if (viaServer.user) {
        return { source: 'server', user: viaServer.user, profile: viaServer.profile ?? null }
      }
      if (viaServer.error && !viaServer.transportError) {
        throw viaServer.error
      }
      throw viaServer.error ?? new Error('server transport failed')
    },
  ]

  for (const email of buildDirectAuthEmailCandidates(raw)) {
    tasks.push(async () => {
      const { data, error } = await signInWithPasswordDirect(email, pwd)
      if (error || !data?.user) throw error ?? new Error('direct auth failed')
      return { source: 'direct', user: data.user, profile: null }
    })
  }

  return firstSuccessfulPromise(tasks)
}
