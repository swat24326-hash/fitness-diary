import { supabase } from './supabase'

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

/**
 * Вход через /api/auth-sign-in (сервер → Supabase), затем setSession в браузере.
 * @returns {Promise<{ user: object, profile: object | null, error: Error | null }>}
 */
export async function signInViaServerApi({ login, password }) {
  let res
  try {
    res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ login, password }),
    })
  } catch (e) {
    return {
      user: null,
      profile: null,
      error: new Error(
        `Не удалось связаться с сервером входа. ${e?.message ?? ''} Обновите страницу (Ctrl+F5) или попробуйте Chrome без VPN.`,
      ),
    }
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
