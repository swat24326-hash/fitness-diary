/**
 * Вход клиента в /me: приглашение из клуба → своя сессия. Токены подписаны тем же JWT_SECRET,
 * но с typ 'client' / 'client_refresh': verifyBearerOwn пускает только typ 'access',
 * а requireClientUser — только 'client', так что токены сотрудника и клиента не взаимозаменяемы.
 */
import { createHash, randomBytes } from 'node:crypto'
import { signOwnJwt, verifyOwnJwt } from '../authOwnCore.js'

export const CLIENT_INVITE_TTL_MS = 72 * 60 * 60 * 1000
export const CLIENT_ACCESS_TTL_SEC = 60 * 60
export const CLIENT_REFRESH_TTL_SEC = 60 * 60 * 24 * 90
export const CLIENT_TOKEN_TYP = 'client'
export const CLIENT_REFRESH_TYP = 'client_refresh'
const MIN_SECRET = 32

export const CLIENT_SESSION_RU = 'Вход устарел — попросите в клубе новую ссылку'
export const CLIENT_INVITE_BAD_RU = 'Ссылка недействительна или уже использована — попросите в клубе новую'

export function clientPortalSecret() {
  const s = String(process.env.JWT_SECRET ?? '')
  return s.length >= MIN_SECRET ? s : ''
}

/** Токен из ссылки: 192 бита, в базе хранится только sha256. */
export function newInviteToken() {
  return randomBytes(24).toString('base64url')
}

export function hashInviteToken(token) {
  const t = String(token ?? '').trim()
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null
  return createHash('sha256').update(t).digest('hex')
}

/**
 * @param {{ used_at?: string|null, expires_at?: string } | null} invite
 * @param {{ id?: string, club_id?: string, archived_at?: string|null } | null} client
 * @returns {string | null} причина отказа (для логов), null — можно гасить
 */
export function inviteDenial(invite, client, nowMs = Date.now()) {
  if (!invite) return 'missing'
  if (invite.used_at) return 'used'
  const exp = Date.parse(String(invite.expires_at ?? ''))
  if (!Number.isFinite(exp) || exp <= nowMs) return 'expired'
  if (!client?.id || client.archived_at) return 'client_inactive'
  if (String(client.club_id ?? '') !== String(invite.club_id ?? '')) return 'club_changed'
  return null
}

/**
 * @param {{ session?: { client_id?: string, revoked_at?: string|null } | null, client?: { id?: string, archived_at?: string|null } | null, clientId: string }} p
 * @returns {string | null}
 */
export function clientSessionDenial({ session, client, clientId }) {
  if (!session || String(session.client_id ?? '') !== String(clientId)) return 'missing'
  if (session.revoked_at) return 'revoked'
  if (!client?.id || client.archived_at) return 'client_inactive'
  return null
}

export function buildClientSession({ clientId, sid }, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const base = { sub: String(clientId), sid: String(sid), aud: 'client', iat: nowSec }
  const expires_at = nowSec + CLIENT_ACCESS_TTL_SEC
  return {
    access_token: signOwnJwt({ ...base, typ: CLIENT_TOKEN_TYP, exp: expires_at }, secret),
    refresh_token: signOwnJwt({ ...base, typ: CLIENT_REFRESH_TYP, exp: nowSec + CLIENT_REFRESH_TTL_SEC }, secret),
    expires_at,
  }
}

/**
 * @param {string} token
 * @param {'client' | 'client_refresh'} typ
 * @returns {{ clientId: string, sid: string } | null}
 */
export function readClientToken(token, typ, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const { payload, error } = verifyOwnJwt(token, secret, nowSec)
  if (error || payload?.typ !== typ || payload?.aud !== 'client') return null
  if (!payload.sub || !payload.sid) return null
  return { clientId: String(payload.sub), sid: String(payload.sid) }
}

export function bearerFromHeaders(headers) {
  const h = String(headers?.authorization ?? headers?.Authorization ?? '')
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}
