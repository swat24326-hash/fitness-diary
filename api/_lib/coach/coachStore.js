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

  touchSession: (sid) => authSessionsStore.touch(sid),
  revokeSession: (sid, userId) => authSessionsStore.revoke(sid, userId),
  devices: userDevicesStore,
}
