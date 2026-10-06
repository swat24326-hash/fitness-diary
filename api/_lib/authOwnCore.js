import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'

/** Включение своего входа. По умолчанию выключено — прод остаётся на Supabase Auth. */
export function isOwnAuthProvider() {
  return String(process.env.AUTH_PROVIDER ?? '').trim().toLowerCase() === 'own'
}

const MIN_SECRET = 32
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEYLEN = 32
export const OWN_ACCESS_TTL_SEC = 60 * 60
export const OWN_REFRESH_TTL_SEC = 60 * 60 * 24 * 30

export function ownAuthSecret() {
  return String(process.env.JWT_SECRET ?? '')
}

/** @returns {string | null} */
export function ownAuthEnvError() {
  if (!isOwnAuthProvider()) return null
  if (ownAuthSecret().length < MIN_SECRET) {
    return 'AUTH_PROVIDER=own: задайте JWT_SECRET длиной от 32 символов.'
  }
  return null
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

/** Хеш пароля. Параметры зашиты, чтобы строка из базы не могла задать огромную стоимость. */
export async function hashOwnPassword(password) {
  const plain = String(password ?? '')
  if (!plain) throw new Error('Пустой пароль')
  const salt = randomBytes(16)
  const key = await scrypt(plain, salt)
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

/** Хеш из Supabase Auth (auth.users.encrypted_password), перенесённый при переезде. */
const BCRYPT_RE = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/
/** Supabase ставит 10; потолок — чтобы строка из базы не заставила сервер считать минутами. */
const BCRYPT_MAX_COST = 12

export function isLegacyBcryptHash(stored) {
  const m = BCRYPT_RE.exec(String(stored ?? ''))
  return Boolean(m) && Number(m[1]) >= 4 && Number(m[1]) <= BCRYPT_MAX_COST
}

/**
 * Продлевать сессию можно только живой и не заблокированной учётке: удаление / блок тренера
 * срабатывают на следующем продлении (отзыв конкретной сессии — auth_sessions).
 * @returns {'missing' | 'blocked' | null}
 */
export function ownRefreshDenial(row) {
  if (!row?.id) return 'missing'
  if (row.is_active === false) return 'blocked'
  return null
}

/** После входа со старым паролем пересохраняем его в наш формат. */
export function ownPasswordNeedsRehash(stored) {
  return isLegacyBcryptHash(stored)
}

export async function verifyOwnPassword(password, stored) {
  if (isLegacyBcryptHash(stored)) return bcrypt.compare(String(password ?? ''), String(stored))
  const parts = String(stored ?? '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  if (Number(parts[1]) !== SCRYPT_N || Number(parts[2]) !== SCRYPT_R || Number(parts[3]) !== SCRYPT_P) {
    return false
  }
  const salt = Buffer.from(parts[4], 'base64url')
  const expected = Buffer.from(parts[5], 'base64url')
  if (!salt.length || expected.length !== KEYLEN) return false
  const key = await scrypt(String(password ?? ''), salt)
  if (key.length !== expected.length) return false
  return timingSafeEqual(key, expected)
}

/**
 * В строку users. Пароль Supabase по-прежнему живёт в Auth, в колонке остаётся метка.
 * @param {{ passwordHash?: string } | null | undefined} created
 */
export function passwordHashForUsersRow(created) {
  const hash = created?.passwordHash
  if (typeof hash === 'string' && hash.startsWith('scrypt$')) return hash
  return 'supabase-auth'
}

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export function signOwnJwt(payload, secret) {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' })
  const body = b64urlJson(payload)
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {number} [nowSec]
 * @returns {{ payload: object | null, error: string | null }}
 */
export function verifyOwnJwt(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3 || !secret) {
    return { payload: null, error: 'Сессия недействительна — войдите снова' }
  }
  const [header, body, sig] = parts
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  const got = Buffer.from(sig)
  const want = Buffer.from(expected)
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { payload: null, error: 'Сессия недействительна — войдите снова' }
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { payload: null, error: 'Сессия недействительна — войдите снова' }
  }
  if (!payload?.exp || Number(payload.exp) <= nowSec) {
    return { payload: null, error: 'Сессия недействительна — войдите снова' }
  }
  return { payload, error: null }
}

export function ownAuthUser(id, email) {
  const now = new Date().toISOString()
  return {
    id: String(id),
    aud: 'authenticated',
    role: 'authenticated',
    email: String(email ?? ''),
    email_confirmed_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { email: String(email ?? '') },
    created_at: now,
    updated_at: now,
  }
}

/**
 * @param {{ id: string, email?: string, sid?: string | null }} user sid — строка auth_sessions (отзыв при «Выйти»)
 * @param {string} secret
 * @param {number} [nowSec]
 */
export function buildOwnSession(user, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const accessExp = nowSec + OWN_ACCESS_TTL_SEC
  const refreshExp = nowSec + OWN_REFRESH_TTL_SEC
  const sid = user.sid ? { sid: String(user.sid) } : {}
  const access_token = signOwnJwt(
    { sub: user.id, email: user.email ?? '', aud: 'authenticated', role: 'authenticated', typ: 'access', ...sid, iat: nowSec, exp: accessExp },
    secret,
  )
  const refresh_token = signOwnJwt(
    { sub: user.id, email: user.email ?? '', typ: 'refresh', ...sid, iat: nowSec, exp: refreshExp },
    secret,
  )
  return {
    access_token,
    refresh_token,
    expires_in: OWN_ACCESS_TTL_SEC,
    expires_at: accessExp,
    token_type: 'bearer',
    user: ownAuthUser(user.id, user.email),
  }
}
