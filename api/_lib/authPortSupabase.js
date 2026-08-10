/**
 * Auth port: Supabase Auth (текущий прод).
 * На C2 заменим реализацию в authPort.js — контракт тот же.
 */
import { createClient } from '@supabase/supabase-js'

/**
 * @param {string} url
 * @param {string} anonKey
 * @param {string} bearerToken
 */
export async function verifyBearerSupabase(url, anonKey, bearerToken) {
  const token = String(bearerToken ?? '').trim()
  if (!token) return { user: null, error: 'Unauthorized' }
  const supabaseAsCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const {
    data: { user },
    error,
  } = await supabaseAsCaller.auth.getUser()
  if (error || !user) {
    return { user: null, error: error?.message || 'Сессия недействительна — войдите снова' }
  }
  return { user, error: null }
}

/**
 * @param {string} url
 * @param {string} anonKey
 * @param {{ email: string, password: string }} creds
 */
export async function signInWithPasswordSupabase(url, anonKey, creds) {
  const supabaseAuth = createClient(url, anonKey)
  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: String(creds?.email ?? '').trim(),
    password: String(creds?.password ?? ''),
  })
  if (error || !data?.session) {
    return { session: null, user: null, error: error?.message || 'Неверный логин или пароль' }
  }
  return { session: data.session, user: data.user, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ email: string, password: string, email_confirm?: boolean, user_metadata?: object }} attrs
 */
export async function adminCreateUserSupabase(supabaseAdmin, attrs) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: attrs.email,
    password: attrs.password,
    email_confirm: attrs.email_confirm !== false,
    user_metadata: attrs.user_metadata,
  })
  return { user: data?.user ?? null, error: error?.message ?? null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} userId
 * @param {string} password
 */
export async function adminUpdatePasswordSupabase(supabaseAdmin, userId, password) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
  return { error: error?.message ?? null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} userId
 */
export async function adminDeleteUserSupabase(supabaseAdmin, userId) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  return { error: error?.message ?? null }
}
