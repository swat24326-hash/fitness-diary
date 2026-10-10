/**
 * Подменный сервер телефона тренера: /api/coach-auth и /api/coach.
 * Решение «пускать ли телефон» и расписание — те же чистые функции, что на сервере; переписка — fakeChat.
 */
import { decideCoachDevice } from '../../../api/_lib/deviceBindingCore.js'
import { buildCoachMe, buildCoachSchedule } from '../../../api/_lib/coach/coachViewCore.js'

const DENIED = { status: 401, json: { error: 'Вход с телефона закончился — войдите снова' } }

/**
 * @param {{ users: object[], clients: object[] }} state
 * @param {ReturnType<import('./fakeChat.mjs').createFakeChat>} chat
 * @param {{ trainerId: string, today: string, schedule: object[] }} opts
 */
export function createFakeCoach(state, chat, { trainerId, today, schedule }) {
  const coach = { devices: [], sessions: [] }
  const trainer = () => state.users.find((u) => u.id === trainerId)
  const deviceOf = (req) => String(req.headers['x-device-id'] ?? '')

  function issue(deviceId) {
    const n = coach.sessions.length + 1
    const row = { access: `coach-access-${n}`, refresh: `coach-refresh-${n}`, deviceId, revoked: false }
    coach.sessions.push(row)
    return { access_token: row.access, refresh_token: row.refresh, expires_at: Math.floor(Date.now() / 1000) + 3600 }
  }

  function signIn(req) {
    const u = trainer()
    const login = String(req.body?.login ?? '').toLowerCase()
    if (!u || (login !== u.login && login !== u.email) || req.body?.password !== u.password) {
      return { status: 401, json: { error: 'Неверный логин или пароль' } }
    }
    const deviceId = deviceOf(req)
    const decision = decideCoachDevice({ deviceId, devices: coach.devices })
    if (decision.register) coach.devices.push({ id: `dev-${coach.devices.length + 1}`, device_id: deviceId, status: 'pending' })
    if (decision.setStatus) coach.devices.find((d) => d.id === decision.deviceRowId).status = decision.setStatus
    if (!decision.allow) return { status: 403, json: { error: 'Телефон ждёт разрешения администратора', code: 'device_pending' } }
    return { status: 200, json: { session: issue(deviceId), user: { name: u.name } } }
  }

  function auth(req) {
    const route = req.body?.action
    if (route === 'sign-in') return signIn(req)
    const s = coach.sessions.find((x) => x.refresh === req.body?.refresh_token)
    if (route === 'sign-out') {
      if (s) s.revoked = true
      return { status: 200, json: {} }
    }
    if (!s || s.revoked || !decideCoachDevice({ deviceId: s.deviceId, devices: coach.devices }).allow) return DENIED
    return { status: 200, json: { session: issue(s.deviceId) } }
  }

  function data(req) {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '')
    const s = coach.sessions.find((x) => x.access === token)
    const allowed = s && !s.revoked && s.deviceId === deviceOf(req) && decideCoachDevice({ deviceId: s.deviceId, devices: coach.devices }).allow
    if (!allowed) return DENIED
    const user = trainer()
    const q = req.searchParams
    const staff = (params, body = null) =>
      chat.staff({ method: body ? 'POST' : 'GET', searchParams: new URLSearchParams({ action: 'chat', ...params }), body }, user)
    if (req.method === 'POST') {
      if (req.body?.op !== 'chat-send') return { status: 400, json: { error: 'Неизвестное действие' } }
      return staff({}, { client_id: req.body.client_id, kind: 'trainer', body: req.body.body, sticker: req.body.sticker })
    }
    const view = q.get('view') ?? 'me'
    if (view === 'me') return { status: 200, json: buildCoachMe(user) }
    if (view === 'schedule') {
      const names = Object.fromEntries(state.clients.filter((c) => c.trainer_id === trainerId).map((c) => [c.id, c.name]))
      return { status: 200, json: { days: buildCoachSchedule(schedule, names, today) } }
    }
    if (view === 'chats') return staff({ view: 'list' })
    if (view === 'chat-thread') return staff({ view: 'thread', kind: 'trainer', client_id: q.get('client_id') })
    if (view === 'push-status') return { status: 200, json: { configured: false, public_key: '', subscribed: false } }
    return { status: 400, json: { error: 'Неизвестный запрос' } }
  }

  /** Админ в «Устройствах тренеров». */
  function setPhoneStatus(status) {
    for (const d of coach.devices) d.status = status
  }

  return { state: coach, handle: (req) => (req.path === '/api/coach-auth' ? auth(req) : data(req)), setPhoneStatus }
}
