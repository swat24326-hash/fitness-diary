import { supabase } from './supabase'
import { emailFromLoginRow, normalizeLoginInput, trainerLocalEmail } from './authLoginResolveCore.js'

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

  let res
  try {
    res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller?.signal,
      body: JSON.stringify({ login: normalizeLoginInput(login), password }),
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
