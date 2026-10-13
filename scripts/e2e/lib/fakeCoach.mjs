/**
 * Подменный сервер телефона тренера: /api/coach-auth и /api/coach.
 * Решение «пускать ли телефон» и расписание — те же чистые функции, что на сервере; переписка — fakeChat.
 */
import { decideCoachDevice } from '../../../api/_lib/deviceBindingCore.js'
import { canStaffInviteClient } from '../../../api/_lib/clientPortal/clientInviteCore.js'
import { buildCoachMe, buildCoachSchedule } from '../../../api/_lib/coach/coachViewCore.js'
import { COACH_HANDOFF_GONE_RU, COACH_INVITE_GONE_RU, coachHandoffDenial, coachInviteDenial } from '../../../api/_lib/coach/coachInviteCore.js'
import { buildCoachClub } from '../../../api/_lib/coach/coachManifestCore.js'
import { buildCoachClients } from '../../../api/_lib/coach/coachClientsCore.js'
import { COACH_SCHEDULE_WRITE_OPS, runCoachScheduleWrite } from '../../../api/_lib/coach/coachScheduleWriteCore.js'
import { resolveCoachScheduleRange } from '../../../src/lib/trainer/coachScheduleEditCore.js'
import { normalizeTrainerScheduleEntry } from '../../../src/lib/trainer/trainerScheduleCore.js'

const DENIED = { status: 401, json: { error: 'Вход с телефона закончился — войдите снова' } }

/**
 * @param {{ users: object[], clients: object[] }} state
 * @param {ReturnType<import('./fakeChat.mjs').createFakeChat>} chat
 * @param {{ trainerId: string, today: string, schedule: object[], trainings?: Record<string, string>,
 *   clientsData?: { memberships?: object[], lifecycleRows?: object[], trainings?: object[], typeCodeById?: Record<string, string> } }} opts
 * trainings — статус тренировки по id (для записей с linked_training_id).
 * clientsData — абонементы, ПЗ и завершённые тренировки для вкладки «Клиенты».
 */
export function createFakeCoach(state, chat, { trainerId, today, schedule, trainings = {}, clientsData = {} }) {
  const coach = { devices: [], sessions: [], invites: [], clientInvites: [] }
  const seededAt = new Date(Date.now() - 3600_000).toISOString()
  for (const e of schedule) {
    e.created_at ??= seededAt
    e.updated_at ??= seededAt
  }
  const trainer = () => state.users.find((u) => u.id === trainerId)
  const deviceOf = (req) => String(req.headers['x-device-id'] ?? '')

  function issue(deviceId) {
    const n = coach.sessions.length + 1
    const row = { access: `coach-access-${n}`, refresh: `coach-refresh-${n}`, deviceId, revoked: false }
    coach.sessions.push(row)
    return { access_token: row.access, refresh_token: row.refresh, expires_at: Math.floor(Date.now() / 1000) + 3600 }
  }

  function admit(deviceId, beforeSession = () => {}) {
    const decision = decideCoachDevice({ deviceId, devices: coach.devices })
    if (decision.register) coach.devices.push({ id: `dev-${coach.devices.length + 1}`, device_id: deviceId, status: 'pending' })
    if (decision.setStatus) coach.devices.find((d) => d.id === decision.deviceRowId).status = decision.setStatus
    if (!decision.allow) return { status: 403, json: { error: 'Телефон ждёт разрешения администратора', code: 'device_pending' } }
    beforeSession()
    return { status: 200, json: { session: issue(deviceId), user: { name: trainer().name } } }
  }

  function signIn(req) {
    const u = trainer()
    const login = String(req.body?.login ?? '').toLowerCase()
    if (!u || (login !== u.login && login !== u.email) || req.body?.password !== u.password) {
      return { status: 401, json: { error: 'Неверный логин или пароль' } }
    }
    return admit(deviceOf(req))
  }

  function redeem(req) {
    const deviceId = deviceOf(req)
    const invite = coach.invites.find((i) => i.token === req.body?.token)
    if (coachInviteDenial(invite, deviceId, Date.now())) return { status: 401, json: { error: COACH_INVITE_GONE_RU } }
    invite.device_id = deviceId
    return admit(deviceId, () => (invite.used_at = new Date().toISOString()))
  }

  /** Тренер открыл на планшете «QR для телефона». */
  function addInvite(token, extra = {}) {
    coach.invites.push({ token, kind: 'qr', device_id: null, used_at: null, expires_at: new Date(Date.now() + 600_000).toISOString(), ...extra })
  }

  /** Значок «Домой» на iPhone: номер телефона берёт из приглашения Safari. */
  function redeemHandoff(req) {
    const invite = coach.invites.find((i) => i.token === req.body?.token)
    if (coachHandoffDenial(invite, Date.now())) return { status: 401, json: { error: COACH_HANDOFF_GONE_RU } }
    const out = admit(invite.device_id, () => (invite.used_at = new Date().toISOString()))
    return out.status === 200 ? { status: 200, json: { ...out.json, device_id: invite.device_id } } : out
  }

  function auth(req) {
    const route = req.body?.action
    if (route === 'sign-in') return signIn(req)
    if (route === 'redeem') return redeem(req)
    if (route === 'handoff') return redeemHandoff(req)
    const s = coach.sessions.find((x) => x.refresh === req.body?.refresh_token)
    if (route === 'sign-out') {
      if (s) s.revoked = true
      return { status: 200, json: {} }
    }
    if (!s || s.revoked || !decideCoachDevice({ deviceId: s.deviceId, devices: coach.devices }).allow) return DENIED
    return { status: 200, json: { session: issue(s.deviceId) } }
  }

  /** Как coachHandler: с телефона — «Тренер» и «Жалобы и предложения». */
  const coachKind = (kind) => (kind === 'supervisor' ? 'supervisor' : 'trainer')

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
      if (req.body?.op === 'handoff') {
        const token = `e2eHandoff_${coach.invites.length}_0123456789abcdef`
        addInvite(token, { kind: 'handoff', device_id: s.deviceId })
        return { status: 200, json: { token, expires_at: coach.invites.at(-1).expires_at } }
      }
      if (COACH_SCHEDULE_WRITE_OPS.includes(req.body?.op)) return scheduleWrite(user, req.body)
      if (req.body?.op === 'client-invite') return clientInvite(user, req.body.client_id)
      const { message_id, emoji, reply_to } = req.body ?? {}
      if (req.body?.op === 'dm-send') return staff({}, { op: 'dm-send', user_id: req.body.user_id, body: req.body.body, sticker: req.body.sticker, reply_to })
      if (req.body?.op === 'dm-react') return staff({}, { op: 'dm-react', user_id: req.body.user_id, message_id, emoji })
      if (req.body?.op === 'chat-react') return staff({}, { op: 'react', client_id: req.body.client_id, kind: coachKind(req.body.kind), message_id, emoji })
      if (req.body?.op !== 'chat-send') return { status: 400, json: { error: 'Неизвестное действие' } }
      return staff({}, { client_id: req.body.client_id, kind: coachKind(req.body.kind), body: req.body.body, sticker: req.body.sticker, reply_to })
    }
    const view = q.get('view') ?? 'me'
    if (view === 'me') {
      const club = state.clubs?.find((x) => x.id === user.club_id)
      return { status: 200, json: { ...buildCoachMe(user), club: buildCoachClub(user.club_id, club?.name) } }
    }
    if (view === 'schedule') {
      const names = Object.fromEntries(state.clients.filter((c) => c.trainer_id === trainerId).map((c) => [c.id, c.name]))
      return { status: 200, json: { days: buildCoachSchedule(schedule, names, today) } }
    }
    if (view === 'schedule-range') return scheduleRange(q)
    if (view === 'clients') {
      const clients = buildCoachClients({
        trainerId,
        clients: state.clients.filter((c) => c.trainer_id === trainerId && !c.archived_at),
        memberships: clientsData.memberships ?? [],
        lifecycleRows: clientsData.lifecycleRows ?? [],
        trainings: clientsData.trainings ?? [],
        typeCodeById: clientsData.typeCodeById ?? {},
      })
      return { status: 200, json: { today, clients } }
    }
    if (view === 'chats') return staff({ view: 'list' })
    if (view === 'contacts') return staff({ view: 'contacts' })
    if (view === 'dm-thread') return staff({ view: 'dm-thread', user_id: q.get('user_id') })
    if (view === 'chat-thread') return staff({ view: 'thread', kind: coachKind(q.get('kind')), client_id: q.get('client_id') })
    if (view === 'dm-search') return staff({ view: 'dm-search', user_id: q.get('user_id'), q: q.get('q') })
    if (view === 'chat-search') return staff({ view: 'search', kind: coachKind(q.get('kind')), client_id: q.get('client_id'), q: q.get('q') })
    if (view === 'push-status') return { status: 200, json: { configured: false, public_key: '', subscribed: false } }
    return { status: 400, json: { error: 'Неизвестный запрос' } }
  }

  const ownClients = () => state.clients.filter((c) => c.trainer_id === trainerId)

  /** Как issueClientInvite: права — canStaffInviteClient, токены складываем для проверки в сценарии. */
  function clientInvite(user, clientId) {
    const client = state.clients.find((c) => c.id === clientId)
    const gate = canStaffInviteClient({ isTrainer: true, user: { id: trainerId }, profile: user }, client)
    if (!gate.ok) return { status: gate.status, json: { error: gate.error } }
    const token = `e2eClientInvite_${coach.clientInvites.length + 1}_0123456789abcdef`
    coach.clientInvites.push({ client_id: clientId, token })
    return { status: 200, json: { token, expires_at: new Date(Date.now() + 72 * 3600_000).toISOString() } }
  }

  /** Ежедневник за период — как coachScheduleHandler: свои записи, имена своих клиентов, статусы тренировок. */
  function scheduleRange(q) {
    const range = resolveCoachScheduleRange(q.get('from'), q.get('to'))
    if (!range) return { status: 400, json: { error: 'Некорректный период Ежедневника' } }
    const entries = schedule
      .filter((e) => e.trainer_id === trainerId && e.day_date >= range.from && e.day_date <= range.to)
      .map(normalizeTrainerScheduleEntry)
      .filter(Boolean)
      .map(({ synced: _s, ...e }) => e)
    const trainingById = Object.fromEntries(
      entries.filter((e) => trainings[e.linked_training_id]).map((e) => [e.linked_training_id, { status: trainings[e.linked_training_id] }]),
    )
    return {
      status: 200,
      json: {
        entries,
        clientNameById: Object.fromEntries(ownClients().map((c) => [c.id, c.name])),
        trainingById,
        clients: ownClients().filter((c) => !c.archived_at).map((c) => ({ id: c.id, name: c.name })),
      },
    }
  }

  /** База для runCoachScheduleWrite: select по id + trainer_id и статусы тренировок. */
  const scheduleDb = {
    from(table) {
      const f = {}
      const q = {
        select: () => q,
        eq: (k, v) => ((f[k] = v), q),
        in: (k, v) => ((f[k] = v), q),
        then(resolve) {
          if (table === 'trainings') {
            return resolve({ data: (f.id ?? []).filter((id) => trainings[id]).map((id) => ({ id, status: trainings[id] })), error: null })
          }
          return resolve({ data: schedule.filter((e) => e.id === f.id && e.trainer_id === f.trainer_id), error: null })
        },
      }
      return q
    },
  }

  /** Запись как executePushRecord: только свои клиенты (authorizePush), строка целиком. */
  async function schedulePush(_ctx, item) {
    const own = new Set(ownClients().map((c) => c.id))
    if ((item.data.client_ids ?? []).some((id) => !own.has(id))) return { ok: false, status: 403, error: 'Нет доступа к клиенту' }
    const at = schedule.findIndex((e) => e.id === (item.remote_id ?? item.data.id))
    if (item.operation === 'delete') {
      if (at >= 0) schedule.splice(at, 1)
    } else if (item.operation === 'update') {
      schedule[at] = { ...item.data }
    } else {
      schedule.push({ ...item.data })
    }
    return { ok: true }
  }

  function scheduleWrite(user, body) {
    const ctx = { supabaseAdmin: scheduleDb, user: { id: trainerId }, profile: user, isTrainer: true }
    return runCoachScheduleWrite(ctx, body.op, body, { push: schedulePush }).then((r) => ({ status: r.status, json: r.body }))
  }

  /** Админ в «Устройствах тренеров». */
  function setPhoneStatus(status) {
    for (const d of coach.devices) d.status = status
  }

  return { state: coach, handle: (req) => (req.path === '/api/coach-auth' ? auth(req) : data(req)), setPhoneStatus, addInvite }
}
