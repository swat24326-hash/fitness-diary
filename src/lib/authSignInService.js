import { supabase } from './supabase'

/** Тот же порядок, что в /api/auth-sign-in (без service role в браузере). */
export async function resolveLoginEmailFromDb(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { email: null, isActive: true, error: null }
  if (trimmed.includes('@')) return { email: trimmed, isActive: true, error: null }

  const loginLower = trimmed.toLowerCase()
  const { data: byExact, error: e1 } = await supabase
    .from('users')
    .select('email, is_active')
    .eq('login', loginLower)
    .maybeSingle()
  if (e1) return { email: null, isActive: true, error: e1 }
  if (byExact?.email) {
    return { email: String(byExact.email).trim(), isActive: byExact.is_active !== false, error: null }
  }

  const { data: byIlike, error: e2 } = await supabase
    .from('users')
    .select('email, is_active')
    .ilike('login', trimmed)
    .maybeSingle()
  if (e2) return { email: null, isActive: true, error: e2 }
  if (byIlike?.email) {
    return { email: String(byIlike.email).trim(), isActive: byIlike.is_active !== false, error: null }
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

/** Vercel /api недоступен — можно войти напрямую через Supabase Auth. */
export function isAuthApiTransportError(message) {
  const msg = String(message ?? '')
  return /failed to fetch|networkerror|network request failed|connection reset|err_connection|timed out|timeout|load failed|abort/i.test(
    msg,
  )
}

const AUTH_API_TIMEOUT_MS = 8_000

/**
 * Вход через /api/auth-sign-in (сервер → Supabase), затем setSession в браузере.
 * @returns {Promise<{ user: object, profile: object | null, error: Error | null }>}
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
      body: JSON.stringify({ login, password }),
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
