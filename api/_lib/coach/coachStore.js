/**
 * Чтение и запись для входа с телефона (service role). Подменяется в verify через deps.
 * Сессии — та же auth_sessions с device_id телефона: «Отозвать» в устройствах и блок учётки гасят их сразу.
 */
import { ilikeExactPattern } from '../../../src/lib/ilikeExactCore.js'
import { normalizeLoginInput, trainerLocalEmail } from '../authLoginResolveCore.js'
import { authSessionsStore } from '../authSessionsStore.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { userDevicesStore } from '../userDevicesStore.js'

const USER_COLS = 'id, email, login, name, role, club_id, is_active'

async function one(query) {
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message || 'Не удалось проверить пользователя')
  return data ?? null
}

export const coachStore = {
  /** Логин, email или логин@trainer.local — как на входе планшета. */
  async findUserByLogin(raw) {
    const login = normalizeLoginInput(raw)
    if (!login) return null
    const db = createServiceDataClient()
    const cols = `${USER_COLS}, password_hash`
    const emailPattern = ilikeExactPattern(login)
    if (login.includes('@')) return emailPattern ? one(db.from('users').select(cols).ilike('email', emailPattern)) : null
    const byLogin = await one(db.from('users').select(cols).eq('login', login.toLowerCase()))
    if (byLogin) return byLogin
    const synthPattern = ilikeExactPattern(trainerLocalEmail(login))
    return synthPattern ? one(db.from('users').select(cols).ilike('email', synthPattern)) : null
  },

  async loadClubName(id) {
    const row = await one(createServiceDataClient().from('clubs').select('name').eq('id', id))
    return String(row?.name ?? '')
  },

  async loadUser(id) {
    return one(createServiceDataClient().from('users').select(USER_COLS).eq('id', id))
  },

  async createSession(userId, deviceId) {
    const { sid, error } = await authSessionsStore.create(userId, deviceId)
    if (error || !sid) throw new Error(error || 'Не удалось создать сессию')
    return sid
  },

  async loadSession(sid) {
    const { row, error } = await authSessionsStore.load(sid, { withDevice: true })
    if (error) throw new Error(error)
    return row
  },

  /** Новый вход гасит прежние неиспользованные того же вида: живёт один последний QR и один вход значка. */
  async createInvite({ userId, tokenHash, expiresAt, kind = 'qr', deviceId = null }) {
    const db = createServiceDataClient()
    const closed = await db
      .from('coach_invites')
      .update({ expires_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('kind', kind)
      .is('used_at', null)
    if (closed.error) throw new Error(closed.error.message || 'Не удалось создать вход')
    const { error } = await db
      .from('coach_invites')
      .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt, kind, device_id: deviceId })
    if (error) throw new Error(error.message || 'Не удалось создать вход')
  },

  async loadInviteByHash(tokenHash) {
    return one(
      createServiceDataClient()
        .from('coach_invites')
        .select('id, user_id, kind, device_id, expires_at, used_at')
        .eq('token_hash', tokenHash),
    )
  },

  /** Закрепить ссылку за телефоном; false — её успел забрать другой. */
  async bindInvite(id, deviceId, expiresAt) {
    const { data, error } = await createServiceDataClient()
      .from('coach_invites')
      .update({ device_id: deviceId, expires_at: expiresAt })
      .eq('id', id)
      .is('device_id', null)
      .is('used_at', null)
      .select('id')
    if (error) throw new Error(error.message || 'Не удалось проверить QR')
    return Array.isArray(data) && data.length > 0
  },

  async markInviteUsed(id) {
    const { data, error } = await createServiceDataClient()
      .from('coach_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', id)
      .is('used_at', null)
      .select('id')
    if (error) throw new Error(error.message || 'Не удалось проверить QR')
    return Array.isArray(data) && data.length > 0
  },

  touchSession: (sid) => authSessionsStore.touch(sid),
  revokeSession: (sid, userId) => authSessionsStore.revoke(sid, userId),
  devices: userDevicesStore,
}
