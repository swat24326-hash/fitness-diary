/**
 * Порт Auth для API.
 * AUTH_PROVIDER=own — свой JWT и хеш пароля. Иначе Supabase, как на проде.
 * @see docs/AUTH_C2_MAP.md
 */
import { isPgDataBackend, pgDataBackendEnvError } from './pgRest/backend.js'
import { isOwnAuthProvider, ownAuthEnvError, passwordHashForUsersRow } from './authOwnCore.js'
import {
  adminCreateUserOwn,
  adminDeleteUserOwn,
  adminUpdatePasswordOwn,
  signInWithPasswordOwn,
  verifyBearerOwn,
} from './authPortOwn.js'
import {
  adminCreateUserSupabase,
  adminDeleteUserSupabase,
  adminUpdatePasswordSupabase,
  signInWithPasswordSupabase,
  verifyBearerSupabase,
} from './authPortSupabase.js'

export { isOwnAuthProvider, passwordHashForUsersRow }

/** Сообщение когда не заданы ключи API (Vercel или portable host). */
export const AUTH_ENV_MISSING_RU =
  'На сервере API задайте SUPABASE_SERVICE_ROLE_KEY (и при необходимости SUPABASE_URL / SUPABASE_ANON_KEY), затем перезапустите / Redeploy.'

function supabaseEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return { url, serviceKey, anonKey }
}

/** Что не хватает, чтобы API вообще проверил вход. null — можно работать. */
export function authRuntimeEnvError() {
  const ownErr = ownAuthEnvError()
  if (ownErr) return ownErr
  const pgErr = pgDataBackendEnvError()
  if (pgErr) return pgErr
  const { url, serviceKey, anonKey } = supabaseEnv()
  if (isPgDataBackend() && isOwnAuthProvider()) return null
  if (isOwnAuthProvider()) {
    if (!url || !serviceKey) return AUTH_ENV_MISSING_RU
    return null
  }
  if (!url || !serviceKey || !anonKey) return AUTH_ENV_MISSING_RU
  return null
}

export function verifyBearer(url, anonKey, token) {
  if (isOwnAuthProvider()) return verifyBearerOwn(token)
  return verifyBearerSupabase(url, anonKey, token)
}

export function signInWithPassword(url, anonKey, creds, opts) {
  if (isOwnAuthProvider()) return signInWithPasswordOwn(url, anonKey, creds)
  return signInWithPasswordSupabase(url, anonKey, creds, opts)
}

export function adminCreateUser(supabaseAdmin, attrs) {
  if (isOwnAuthProvider()) return adminCreateUserOwn(supabaseAdmin, attrs)
  return adminCreateUserSupabase(supabaseAdmin, attrs)
}

export function adminUpdatePassword(supabaseAdmin, userId, password) {
  if (isOwnAuthProvider()) return adminUpdatePasswordOwn(supabaseAdmin, userId, password)
  return adminUpdatePasswordSupabase(supabaseAdmin, userId, password)
}

export function adminDeleteUser(supabaseAdmin, userId) {
  if (isOwnAuthProvider()) return adminDeleteUserOwn()
  return adminDeleteUserSupabase(supabaseAdmin, userId)
}
