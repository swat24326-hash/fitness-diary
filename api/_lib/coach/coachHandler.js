/**
 * /api/coach — данные телефона тренера. Только пропуск 'coach' (requireCoachUser), только онлайн.
 * GET  ?view=me | schedule | chats | chat-thread&client_id[&before] | push-status&endpoint
 * POST { op: 'chat-send', client_id, body | sticker } | { op: 'push-subscribe' | 'push-unsubscribe', ... }
 * Переписка — те же обработчики, что у планшета (handleStaffChat*), только диалоги «Тренер» своих клиентов.
 */
import { todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { PUSH_APP_COACH } from '../../../src/lib/push/pushTargetUrlCore.js'
import { sendJson, setCors } from '../adminSupabase.js'
import { loadInChunks } from '../batchCore.js'
import { handleStaffChatGet, handleStaffChatPost } from '../chat/chatStaffHandler.js'
import { rows } from '../inbox/inboxStore.js'
import { handlePushSubscriptionPost, pushServerStatus } from '../pushSubscriptionHandler.js'
import { COACH_SCHEDULE_FIELDS, buildCoachMe, buildCoachSchedule, coachScheduleDays } from './coachViewCore.js'
import { requireCoachUser } from './requireCoachUser.js'

function parseBody(body) {
  if (typeof body !== 'string') return body ?? {}
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

async function sendSchedule(ctx, res) {
  const db = ctx.supabaseAdmin
  const today = todayInTimeZoneIso()
  const days = coachScheduleDays(today)
  const entries = await rows(
    db.from('trainer_schedule_entries').select(COACH_SCHEDULE_FIELDS).eq('trainer_id', ctx.user.id).in('day_date', days),
  )
  const ids = [...new Set(entries.flatMap((e) => (Array.isArray(e.client_ids) ? e.client_ids.map(String) : [])))]
  const own = await loadInChunks(ids, (part) =>
    rows(db.from('clients').select('id, name').eq('trainer_id', ctx.user.id).in('id', part)),
  )
  const names = Object.fromEntries(own.map((c) => [String(c.id), String(c.name ?? '')]))
  sendJson(res, 200, { days: buildCoachSchedule(entries, names, today) })
}

async function sendPushStatus(ctx, req, res) {
  const endpoint = String(req.query?.endpoint ?? '').trim()
  const found = endpoint
    ? await rows(
        ctx.supabaseAdmin
          .from('user_push_subscriptions')
          .select('id')
          .eq('user_id', ctx.user.id)
          .eq('endpoint', endpoint)
          .eq('app', PUSH_APP_COACH),
      )
    : []
  sendJson(res, 200, { ...pushServerStatus(), subscribed: found.length > 0 })
}

async function handleGet(ctx, req, res) {
  const view = String(req.query?.view ?? 'me')
  if (view === 'me') return sendJson(res, 200, buildCoachMe(ctx.profile))
  if (view === 'schedule') return sendSchedule(ctx, res)
  if (view === 'push-status') return sendPushStatus(ctx, req, res)
  if (view === 'chats') return handleStaffChatGet(ctx, { query: { view: 'list' } }, res)
  if (view === 'chat-thread') {
    const { client_id, before } = req.query ?? {}
    return handleStaffChatGet(ctx, { query: { view: 'thread', kind: 'trainer', client_id, before } }, res)
  }
  sendJson(res, 400, { error: 'Неизвестный запрос' })
}

async function handlePost(ctx, res, body) {
  const op = String(body.op ?? '')
  if (op === 'chat-send') {
    return handleStaffChatPost(ctx, res, { op: 'send', kind: 'trainer', client_id: body.client_id, body: body.body, sticker: body.sticker })
  }
  if (op === 'push-subscribe' || op === 'push-unsubscribe') {
    const { endpoint, p256dh, auth, user_agent } = body
    return handlePushSubscriptionPost(
      { ...ctx, pushApp: PUSH_APP_COACH },
      res,
      { op: op === 'push-subscribe' ? 'subscribe' : 'unsubscribe', endpoint, p256dh, auth, user_agent, club_id: ctx.profile?.club_id ?? null },
    )
  }
  sendJson(res, 400, { error: 'Неизвестное действие' })
}

export function createCoachHandler(auth = requireCoachUser) {
  return async function coachHandler(req, res) {
    setCors(res, 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const ctx = await auth(req, res)
    if (!ctx) return
    if (req.method === 'GET') return handleGet(ctx, req, res)
    return handlePost(ctx, res, parseBody(req.body))
  }
}
