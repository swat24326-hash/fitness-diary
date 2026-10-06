import { randomUUID } from 'node:crypto'
import { ilikeExactPattern } from '../../src/lib/ilikeExactCore.js'
import { newPasswordError } from '../../src/lib/passwordPolicyCore.js'
import { normalizePasswordInput } from './authLoginResolveCore.js'
import { ownSessionDenial } from './authSessionsCore.js'
import { authSessionsStore } from './authSessionsStore.js'
import {
  buildOwnSession,
  hashOwnPassword,
  isOwnAuthProvider,
  ownAuthSecret,
  ownPasswordNeedsRehash,
  ownRefreshDenial,
  verifyOwnJwt,
  verifyOwnPassword,
} from './authOwnCore.js'
import { createServiceDataClient } from './pgRest/serviceClient.js'
import { pruneVerifyBearerMemo, readVerifyBearerMemoHit } from './verifyBearerMemoCore.js'

const INVALID_RU = 'Неверный логин или пароль'
const BLOCKED_RU = 'Учётная запись заблокирована'
const SESSION_RU = 'Сессия недействительна — войдите снова'

/** @type {Map<string, { value: { user: object, error: null }, at: number }>} */
const verifyMemo = new Map()

async function findUserByEmail(email) {
  const emailPattern = ilikeExactPattern(email)
  if (!emailPattern) return { row: null, error: null }
  const client = createServiceDataClient()
  const { data, error } = await client
    .from('users')
    .select('id, email, password_hash, is_active')
    .ilike('email', emailPattern)
    .maybeSingle()
  if (error) return { row: null, error: error.message || 'Не удалось проверить пользователя' }
  return { row: data ?? null, error: null }
}

async function rehashAfterLegacyLogin(userId, password) {
  try {
    const passwordHash = await hashOwnPassword(password)
    const { error } = await createServiceDataClient().from('users').update({ password_hash: passwordHash }).eq('id', userId)
    if (error) console.warn('[auth-own] rehash after legacy login:', error.message)
  } catch (e) {
    console.warn('[auth-own] rehash after legacy login:', e?.message || e)
  }
}

/**
 * @param {string} _url
 * @param {string} _anonKey
 * @param {{ email: string, password: string }} creds
 */
export async function signInWithPasswordOwn(_url, _anonKey, creds) {
  const email = String(creds?.email ?? '').trim()
  const password = normalizePasswordInput(creds?.password)
  if (!email || !password) return { session: null, user: null, error: INVALID_RU }
  const { row, error } = await findUserByEmail(email)
  if (error) return { session: null, user: null, error }
  if (!row?.id) return { session: null, user: null, error: INVALID_RU }
  if (row.is_active === false) return { session: null, user: null, error: BLOCKED_RU }
  const ok = await verifyOwnPassword(password, row.password_hash)
  if (!ok) return { session: null, user: null, error: INVALID_RU }
  if (ownPasswordNeedsRehash(row.password_hash)) await rehashAfterLegacyLogin(row.id, password)
  const sid = await createSessionSid(authSessionsStore, String(row.id))
  const session = buildOwnSession({ id: String(row.id), email: row.email || email, sid }, ownAuthSecret())
  return { session, user: session.user, error: null }
}

/** Без таблицы auth_sessions (миграция не накатана) вход работает, но «Выйти» не отзывает refresh. */
async function createSessionSid(sessions, userId) {
  try {
    const { sid, error } = await sessions.create(userId)
    if (error) console.warn('[auth-own] auth_sessions:', error)
    return sid
  } catch (e) {
    console.warn('[auth-own] auth_sessions:', e?.message || e)
    return null
  }
}

/** Отозвать все сессии (блок, смена пароля). Сбой не валит основное действие. */
export async function revokeAllOwnSessions(userId, sessions = authSessionsStore) {
  if (!isOwnAuthProvider() || !userId) return
  try {
    const { error } = await sessions.revokeAllForUser(String(userId))
    if (error) console.warn('[auth-own] revoke all sessions:', error)
  } catch (e) {
    console.warn('[auth-own] revoke all sessions:', e?.message || e)
  }
}

/**
 * «Выйти»: отозвать сессию по refresh (access к этому моменту мог истечь) или access.
 * @param {string[]} tokens
 * @param {'local' | 'global'} scope
 */
export async function logoutOwnSession(tokens, scope, sessions = authSessionsStore) {
  const secret = ownAuthSecret()
  let payload = null
  for (const t of tokens) {
    const v = verifyOwnJwt(t, secret)
    if (v.payload?.sub && (v.payload.typ === 'refresh' || v.payload.typ === 'access')) {
      payload = v.payload
      break
    }
  }
  if (!payload) return { revoked: false }
  const userId = String(payload.sub)
  try {
    if (scope === 'global') {
      const { error } = await sessions.revokeAllForUser(userId)
      return { revoked: !error, error: error ?? null }
    }
    if (!payload.sid) return { revoked: false }
    const { error } = await sessions.revoke(String(payload.sid), userId)
    return { revoked: !error, error: error ?? null }
  } catch (e) {
    return { revoked: false, error: e?.message || String(e) }
  }
}

/**
 * @param {string} token
 */
export async function verifyBearerOwn(token) {
  const raw = String(token ?? '').trim()
  if (!raw) return { user: null, error: 'Unauthorized' }
  const now = Date.now()
  const cached = readVerifyBearerMemoHit(raw, verifyMemo.get(raw), now)
  if (cached) return { user: cached.user, error: null }
  const { payload, error } = verifyOwnJwt(raw, ownAuthSecret())
  if (error || !payload?.sub || payload.typ !== 'access') {
    return { user: null, error: error || SESSION_RU }
  }
  const user = { id: String(payload.sub), email: String(payload.email ?? '') }
  verifyMemo.set(raw, { value: { user, error: null }, at: now })
  pruneVerifyBearerMemo(verifyMemo)
  return { user, error: null }
}

/**
 * @param {object} _supabaseAdmin
 * @param {{ email: string, password: string }} attrs
 */
export async function adminCreateUserOwn(_supabaseAdmin, attrs) {
  const email = String(attrs?.email ?? '').trim()
  const password = normalizePasswordInput(attrs?.password)
  if (!email || !password) return { user: null, passwordHash: null, error: 'Укажите email и пароль' }
  const passwordErr = newPasswordError(password)
  if (passwordErr) return { user: null, passwordHash: null, error: passwordErr }
  const passwordHash = await hashOwnPassword(password)
  return {
    user: { id: randomUUID(), email },
    passwordHash,
    error: null,
  }
}

/**
 * @param {object} supabaseAdmin
 * @param {string} userId
 * @param {string} password
 */
export async function adminUpdatePasswordOwn(supabaseAdmin, userId, password) {
  const plain = normalizePasswordInput(password)
  const passwordErr = newPasswordError(plain)
  if (passwordErr) return { error: passwordErr }
  const passwordHash = await hashOwnPassword(plain)
  const { error } = await supabaseAdmin.from('users').update({ password_hash: passwordHash }).eq('id', userId)
  if (!error) await revokeAllOwnSessions(userId)
  return { error: error?.message ?? null }
}

/** Отдельной учётной записи Auth нет: строку users удаляет вызывающий код. */
export async function adminDeleteUserOwn() {
  return { error: null }
}

async function findUserById(id) {
  const { data, error } = await createServiceDataClient()
    .from('users')
    .select('id, email, is_active')
    .eq('id', id)
    .maybeSingle()
  if (error) return { row: null, error: error.message || 'Не удалось проверить пользователя' }
  return { row: data ?? null, error: null }
}

/**
 * Новый access по refresh-токену. Каждое продление сверяется с users (удалён / заблокирован)
 * и с auth_sessions (вышел / отозвано админом → вход заново). Токен без sid (выдан до 06.10)
 * получает новую сессию на первом продлении.
 * @param {string} refreshToken
 * @param {(id: string) => Promise<{ row: object | null, error: string | null }>} [loadUserById]
 * @param {typeof authSessionsStore} [sessions]
 */
export async function refreshOwnSession(refreshToken, loadUserById = findUserById, sessions = authSessionsStore) {
  const { payload, error } = verifyOwnJwt(refreshToken, ownAuthSecret())
  if (error || payload?.typ !== 'refresh' || !payload?.sub) {
    return { session: null, error: error || SESSION_RU }
  }
  const { row, error: loadErr } = await loadUserById(String(payload.sub))
  if (loadErr) return { session: null, error: loadErr, transient: true }
  const denial = ownRefreshDenial(row)
  if (denial === 'blocked') return { session: null, error: BLOCKED_RU }
  if (denial) return { session: null, error: SESSION_RU }

  let sid = payload.sid ? String(payload.sid) : null
  if (sid) {
    let loaded
    try {
      loaded = await sessions.load(sid)
    } catch (e) {
      loaded = { row: null, error: e?.message || String(e) }
    }
    if (loaded.error) return { session: null, error: loaded.error, transient: true }
    if (ownSessionDenial(loaded.row, row.id)) return { session: null, error: SESSION_RU }
    sessions.touch(sid).catch(() => {})
  } else {
    sid = await createSessionSid(sessions, String(row.id))
  }
  const session = buildOwnSession({ id: String(row.id), email: row.email || payload.email || '', sid }, ownAuthSecret())
  return { session, error: null }
}
