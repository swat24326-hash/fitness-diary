import { randomUUID } from 'node:crypto'
import { normalizePasswordInput } from './authLoginResolveCore.js'
import {
  buildOwnSession,
  hashOwnPassword,
  ownAuthSecret,
  ownPasswordNeedsRehash,
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
  const client = createServiceDataClient()
  const { data, error } = await client
    .from('users')
    .select('id, email, password_hash, is_active')
    .ilike('email', String(email ?? '').trim())
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
  const session = buildOwnSession({ id: String(row.id), email: row.email || email }, ownAuthSecret())
  return { session, user: session.user, error: null }
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
  if (password.length < 6) return { user: null, passwordHash: null, error: 'Пароль не короче 6 символов' }
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
  if (!plain || plain.length < 6) return { error: 'Пароль не короче 6 символов' }
  const passwordHash = await hashOwnPassword(plain)
  const { error } = await supabaseAdmin.from('users').update({ password_hash: passwordHash }).eq('id', userId)
  return { error: error?.message ?? null }
}

/** Отдельной учётной записи Auth нет: строку users удаляет вызывающий код. */
export async function adminDeleteUserOwn() {
  return { error: null }
}

/**
 * Новый access по refresh-токену. Старый refresh остаётся годным до срока — списка отзыва нет.
 * @param {string} refreshToken
 */
export function refreshOwnSession(refreshToken) {
  const { payload, error } = verifyOwnJwt(refreshToken, ownAuthSecret())
  if (error || payload?.typ !== 'refresh' || !payload?.sub) {
    return { session: null, error: error || SESSION_RU }
  }
  const session = buildOwnSession({ id: String(payload.sub), email: payload.email ?? '' }, ownAuthSecret())
  return { session, error: null }
}
