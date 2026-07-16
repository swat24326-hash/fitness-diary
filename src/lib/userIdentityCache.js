/**
 * Кэш идентичности пользователя — переживает reload и медленный getSession на планшете.
 */

const IDENTITY_KEY = 'fitness-diary-user-identity-v1'

/** @typedef {{ id: string, email: string, name: string, club_id: string | null, role: string, at: number }} IdentityCache */

/**
 * @param {string | null | undefined} uid
 * @param {string | null | undefined} email
 * @returns {IdentityCache | null}
 */
function parseIdentityRow(o, uid, email) {
  if (!o || typeof o !== 'object') return null
  const idOk = uid && o.id && String(o.id) === String(uid)
  const em = String(email ?? '').trim().toLowerCase()
  const emOk = em && String(o.email ?? '').trim().toLowerCase() === em
  if (uid || email) {
    if (!idOk && !emOk) return null
  } else if (!o.id) {
    return null
  }
  return {
    id: String(o.id ?? ''),
    email: String(o.email ?? ''),
    name: String(o.name ?? o.email ?? ''),
    club_id: o.club_id ? String(o.club_id) : null,
    role: String(o.role ?? 'trainer'),
    at: Number(o.at) || 0,
  }
}

/**
 * @param {string | null | undefined} uid
 * @param {string | null | undefined} email
 * @returns {IdentityCache | null}
 */
export function readIdentityCache(uid, email) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    return parseIdentityRow(JSON.parse(raw), uid, email)
  } catch {
    return null
  }
}

/** Последний кэш на устройстве (если в storage ещё есть refresh_token). */
export function readIdentityCacheLatest() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    return parseIdentityRow(JSON.parse(raw), null, null)
  } catch {
    return null
  }
}

/**
 * @param {{ id?: string, email?: string, name?: string, club_id?: string | null, role?: string }} user
 */
export function writeIdentityCache(user) {
  if (typeof localStorage === 'undefined' || !user?.id) return
  try {
    const prev = readIdentityCache(user.id, user.email) ?? {}
    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({
        id: String(user.id),
        email: user.email ? String(user.email).trim().toLowerCase() : prev.email ?? '',
        name: String(user.name ?? user.email ?? prev.name ?? ''),
        club_id: user.club_id != null && String(user.club_id).trim()
          ? String(user.club_id).trim()
          : prev.club_id ?? null,
        role: String(user.role ?? prev.role ?? 'trainer'),
        at: Date.now(),
      }),
    )
  } catch {
    /* ignore */
  }
}

export function clearIdentityCache() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(IDENTITY_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Ключи localStorage с сессией Supabase (sb-*-auth-token).
 * @param {string} [supabaseUrl]
 * @returns {string[]}
 */
export function listPersistedSupabaseAuthKeys(supabaseUrl) {
  if (typeof localStorage === 'undefined') return []
  const keys = []
  try {
    if (supabaseUrl) {
      try {
        const ref = new URL(supabaseUrl).hostname.split('.')[0]
        if (ref) keys.push(`sb-${ref}-auth-token`)
      } catch {
        /* ignore */
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('sb-') && k.endsWith('-auth-token')) keys.push(k)
    }
  } catch {
    /* ignore */
  }
  return [...new Set(keys)]
}

/**
 * Есть ли refresh_token в localStorage Supabase (сессия может восстановиться).
 * @param {string} [supabaseUrl]
 */
export function hasPersistedSupabaseSession(supabaseUrl) {
  if (typeof localStorage === 'undefined') return false
  try {
    for (const key of listPersistedSupabaseAuthKeys(supabaseUrl)) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const data = JSON.parse(raw)
      if (data?.refresh_token) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/**
 * Жёстко убрать токены Supabase из localStorage (явный выход с планшета).
 * @param {string} [supabaseUrl]
 */
export function clearPersistedSupabaseSession(supabaseUrl) {
  if (typeof localStorage === 'undefined') return
  try {
    for (const key of listPersistedSupabaseAuthKeys(supabaseUrl)) {
      localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {IdentityCache | null} cached
 * @param {{ id: string, email?: string, name?: string, club_id?: string | null }} user
 */
export function mergeIdentityCacheIntoUser(cached, user) {
  if (!cached || !user) return user
  return {
    ...user,
    name: user.name || cached.name || user.email,
    club_id: user.club_id ?? cached.club_id ?? null,
  }
}
