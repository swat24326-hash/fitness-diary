/**
 * Пропуск телефона тренера (/coach). Подписан тем же JWT_SECRET, но typ 'coach' / 'coach_refresh':
 * verifyBearerOwn и /rest/v1 пускают только typ 'access', поэтому с личного телефона не открываются
 * trainer-pull, push-record и прямой доступ к базе. requireCoachUser принимает только 'coach'.
 */
import { signOwnJwt, verifyOwnJwt } from '../authOwnCore.js'
import { isCoachDeviceId, isDeviceBoundRole } from '../deviceBindingCore.js'

export const COACH_ACCESS_TTL_SEC = 60 * 60
export const COACH_REFRESH_TTL_SEC = 60 * 60 * 24 * 30
export const COACH_TOKEN_TYP = 'coach'
export const COACH_REFRESH_TYP = 'coach_refresh'
const MIN_SECRET = 32

export const COACH_SESSION_RU = 'Вход устарел — войдите снова'
export const COACH_ONLY_TRAINER_RU = 'Приложение на телефоне — только для тренеров'
export const COACH_INVALID_RU = 'Неверный логин или пароль'
export const COACH_BLOCKED_RU = 'Учётная запись заблокирована'

export function coachSecret() {
  const s = String(process.env.JWT_SECRET ?? '')
  return s.length >= MIN_SECRET ? s : ''
}

export function isCoachRole(role) {
  return isDeviceBoundRole(role)
}

/**
 * Учётка, сессия и телефон — проверка на каждый запрос и продление.
 * @param {{ user: { id?: string, role?: string, is_active?: boolean } | null, session: { user_id?: string, revoked_at?: string | null, device_id?: string | null } | null, userId: string, deviceId: string }} p
 * @returns {'blocked' | 'role' | 'session' | null}
 */
export function coachAccessDenial({ user, session, userId, deviceId }) {
  if (!user?.id || String(user.id) !== String(userId)) return 'session'
  if (user.is_active === false) return 'blocked'
  if (!isCoachRole(user.role)) return 'role'
  if (!session || String(session.user_id ?? '') !== String(userId) || session.revoked_at) return 'session'
  if (String(session.device_id ?? '') !== String(deviceId)) return 'session'
  return null
}

export function buildCoachSession({ userId, sid, deviceId }, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const base = { sub: String(userId), sid: String(sid), dev: String(deviceId), aud: 'coach', iat: nowSec }
  const expires_at = nowSec + COACH_ACCESS_TTL_SEC
  return {
    access_token: signOwnJwt({ ...base, typ: COACH_TOKEN_TYP, exp: expires_at }, secret),
    refresh_token: signOwnJwt({ ...base, typ: COACH_REFRESH_TYP, exp: nowSec + COACH_REFRESH_TTL_SEC }, secret),
    expires_at,
  }
}

/**
 * @param {'coach' | 'coach_refresh'} typ
 * @returns {{ userId: string, sid: string, deviceId: string } | null}
 */
export function readCoachToken(token, typ, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const { payload, error } = verifyOwnJwt(token, secret, nowSec)
  if (error || payload?.typ !== typ || payload?.aud !== 'coach') return null
  if (!payload.sub || !payload.sid || !isCoachDeviceId(payload.dev)) return null
  return { userId: String(payload.sub), sid: String(payload.sid), deviceId: String(payload.dev) }
}
