/**
 * Порт Auth для API.
 * Прод: AUTH_PROVIDER=own + DATA_BACKEND=pg (Supabase Auth снят в R4, 16.10.2026).
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

export { isOwnAuthProvider, passwordHashForUsersRow }

/** Сообщение когда на сервере не включён свой Auth / PG (старый контур Supabase удалён). */
export const AUTH_ENV_MISSING_RU =
  'На сервере API задайте AUTH_PROVIDER=own, DATA_BACKEND=pg, JWT_SECRET и DATABASE_URL, затем перезапустите сервис.'

function requireOwnAuth() {
  if (!isOwnAuthProvider()) {
    return { ok: false, error: AUTH_ENV_MISSING_RU }
  }
  return { ok: true }
}

/** Что не хватает, чтобы API вообще проверил вход. null — можно работать. */
export function authRuntimeEnvError() {
  const ownErr = ownAuthEnvError()
  if (ownErr) return ownErr
  const pgErr = pgDataBackendEnvError()
  if (pgErr) return pgErr
  if (isPgDataBackend() && isOwnAuthProvider()) return null
  return AUTH_ENV_MISSING_RU
}

export function verifyBearer(_url, _anonKey, token) {
  const gate = requireOwnAuth()
  if (!gate.ok) return Promise.resolve({ user: null, error: gate.error })
  return verifyBearerOwn(token)
}

export function signInWithPassword(url, anonKey, creds, _opts) {
  const gate = requireOwnAuth()
  if (!gate.ok) return Promise.resolve({ session: null, user: null, error: gate.error })
  return signInWithPasswordOwn(url, anonKey, creds)
}

export function adminCreateUser(supabaseAdmin, attrs) {
  const gate = requireOwnAuth()
  if (!gate.ok) return Promise.resolve({ user: null, error: gate.error })
  return adminCreateUserOwn(supabaseAdmin, attrs)
}

export function adminUpdatePassword(supabaseAdmin, userId, password) {
  const gate = requireOwnAuth()
  if (!gate.ok) return Promise.resolve({ error: gate.error })
  return adminUpdatePasswordOwn(supabaseAdmin, userId, password)
}

export function adminDeleteUser(_supabaseAdmin, _userId) {
  const gate = requireOwnAuth()
  if (!gate.ok) return Promise.resolve({ error: gate.error })
  return adminDeleteUserOwn()
}
