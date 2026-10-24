/**
 * /api/coach — данные телефона тренера. Только пропуск 'coach' (requireCoachUser), только онлайн.
 * GET  ?view=me | schedule | chats | contacts | chat-thread&client_id[&kind=supervisor][&before][&seen=0] | push-status&endpoint
 *      contacts — папки «Сообщений», клиенты с приложением сверху (chatContactsHandler.js)
 *      | dm-thread&user_id[&before] — переписка с коллегой / администрацией (staffDmHandler.js)
 *      | group-thread | group-search | group-readers — чат клуба (staffGroupRoutes.js); POST op group-send | group-react | group-mute | group-pin | group-voice-*
 *      | chat-search&client_id[&kind]&q | dm-search&user_id&q — поиск по диалогу → { results }
 *      | schedule-range&from&to — Ежедневник за период (coachScheduleHandler.js)
 *      | clients — свои «Активные» клиенты с абонементами (coachClientsHandler.js)
 * GET  ?manifest=<club uuid> — без пропуска: manifest с названием клуба (браузер шлёт его без токена).
 * POST { op: 'chat-send', client_id, kind?, body | sticker | (audio, sec, wave), reply_to? } | { op: 'push-subscribe' | 'push-unsubscribe', ... }
 *      | { op: 'push-prefs', endpoint, schedule_reminders? } — напоминания Ежедневника на этом телефоне
 *      | { op: 'dm-send', user_id, body | sticker | (audio, sec, wave), reply_to? } — сообщение коллеге / администрации (reply_to — ответ с цитатой)
 *      | { op: 'chat-react', client_id, kind?, message_id, emoji|null } | { op: 'dm-react', user_id, message_id, emoji|null } — реакция
 *      | { op: 'chat-voice-audio' | 'chat-voice-text', client_id, kind?, message_id } | { op: 'dm-voice-audio' | 'dm-voice-text', user_id, message_id }
 *      | { op: 'chat-attach', client_id, kind?, message_id } | { op: 'dm-attach', user_id, message_id } → { data, mime, name } — фото / PDF
 *        — звук голосового (сутки) и расшифровка «→ Аа»; у видеокружка chat-attach / dm-attach отдают байты
 *      | бинарный POST video/mp4|webm ?op=chat-send|dm-send|group-send&…&sec — видеокружок (chatVideoHandler.js)
 *      | { op: 'client-invite', client_id } — ссылка клиенту в приложение (только выдать, отключать — с планшета)
 *      | { op: 'handoff' } — одноразовый вход для значка iPhone (coachHandoffHandler.js)
 *      | { op: 'avatar-get' | 'avatar-set' (data — base64 JPEG) | 'avatar-delete' } — своё фото профиля (../profile/avatarHandler.js)
 *      | { op: 'schedule-save' | 'schedule-delete' | 'schedule-copies', ... } — правка Ежедневника
 * Переписка — те же обработчики, что у планшета (handleStaffChat*), только диалоги «Тренер» своих клиентов.
 */
import { todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { PUSH_APP_COACH } from '../../../src/lib/push/pushTargetUrlCore.js'
import { sendJson, setCors } from '../adminSupabase.js'
import { loadInChunks } from '../batchCore.js'
import { handleStaffChatGet, handleStaffChatPost } from '../chat/chatStaffHandler.js'
import { handleStaffStoriesGet, handleStaffStoriesPost } from '../stories/storyHandler.js'
import { sendChatContacts } from '../chat/chatContactsHandler.js'
import { reactStaffDmMessage, sendStaffDmMessage, sendStaffDmSearch, sendStaffDmThread, sendStaffDmVoice } from '../chat/staffDmHandler.js'
import { handleStaffGroupGet, handleStaffGroupPost } from '../chat/staffGroupRoutes.js'
import { VIDEO_OPS_COACH, isVideoUpload, videoSendBody } from '../chat/chatVideoHandler.js'
import { issueClientInvite } from '../clientPortal/clientInviteHandler.js'
import { isAvatarAction, sendAvatarOp } from '../profile/avatarHandler.js'
import { rows } from '../inbox/inboxStore.js'
import { handlePushSubscriptionPost, pushServerStatus } from '../pushSubscriptionHandler.js'
import { COACH_SCHEDULE_FIELDS, buildCoachMe, buildCoachSchedule, coachScheduleDays } from './coachViewCore.js'
import { requireCoachUser } from './requireCoachUser.js'
import { issueCoachHandoff } from './coachHandoffHandler.js'
import { sendCoachClients } from './coachClientsHandler.js'
import { COACH_SCHEDULE_WRITE_OPS, handleCoachScheduleWrite, sendCoachScheduleRange } from './coachScheduleHandler.js'
import { buildCoachClub, buildCoachManifest, coachManifestUrl } from './coachManifestCore.js'
import { coachStore } from './coachStore.js'

/** С телефона — «Тренер» и «Жалобы и предложения» (доступ к последнему есть только у связанного с управляющим). */
const coachChatKind = (kind) => (String(kind ?? '') === 'supervisor' ? 'supervisor' : 'trainer')

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

async function sendMe(ctx, res, store) {
  const clubId = String(ctx.profile?.club_id ?? '').trim()
  const clubName = clubId ? await store.loadClubName(clubId).catch(() => '') : ''
  sendJson(res, 200, { ...buildCoachMe(ctx.profile), club: buildCoachClub(clubId, clubName) })
}

async function sendManifest(res, clubId, store) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.end(JSON.stringify(buildCoachManifest(await store.loadClubName(clubId))))
}

async function handleGet(ctx, req, res, store) {
  const view = String(req.query?.view ?? 'me')
  if (view === 'me') return sendMe(ctx, res, store)
  if (view === 'schedule') return sendSchedule(ctx, res)
  if (view === 'schedule-range') return sendCoachScheduleRange(ctx, req, res)
  if (view === 'clients') return sendCoachClients(ctx, res)
  if (view === 'push-status') return sendPushStatus(ctx, req, res)
  if (view === 'stories') return handleStaffStoriesGet(ctx, req.query, res)
  if (view === 'chats') return handleStaffChatGet(ctx, { query: { view: 'list' } }, res)
  if (view === 'contacts') return sendChatContacts(ctx, res)
  if (view === 'dm-thread') return sendStaffDmThread(ctx, res, req.query?.user_id, req.query?.before, req.query?.seen)
  if (view === 'dm-search') return sendStaffDmSearch(ctx, res, req.query?.user_id, req.query?.q)
  if (view.startsWith('group-')) return handleStaffGroupGet(ctx, res, view, req.query ?? {})
  if (view === 'chat-search') {
    const { client_id, q } = req.query ?? {}
    return handleStaffChatGet(ctx, { query: { view: 'search', kind: coachChatKind(req.query?.kind), client_id, q } }, res)
  }
  if (view === 'chat-thread') {
    const { client_id, before, seen } = req.query ?? {}
    return handleStaffChatGet(ctx, { query: { view: 'thread', kind: coachChatKind(req.query?.kind), client_id, before, seen } }, res)
  }
  sendJson(res, 400, { error: 'Неизвестный запрос' })
}

async function handlePost(ctx, res, body, store) {
  const op = String(body.op ?? '')
  if (op.startsWith('story-')) return handleStaffStoriesPost(ctx, { ...body, op: op.slice('story-'.length) }, res)
  if (op === 'handoff') return issueCoachHandoff(ctx, res, store)
  if (isAvatarAction(op)) return sendAvatarOp(res, ctx.supabaseAdmin, { table: 'users', side: 'staff', id: String(ctx.user.id) }, op, body)
  if (COACH_SCHEDULE_WRITE_OPS.includes(op)) return handleCoachScheduleWrite(ctx, res, op, body)
  if (op === 'chat-send') {
    const kind = coachChatKind(body.kind)
    return handleStaffChatPost(ctx, res, {
      op: 'send',
      kind,
      client_id: body.client_id,
      body: body.body,
      sticker: body.sticker,
      parts: body.parts,
      audio: body.audio,
      trim: body.trim,
      sec: body.sec,
      wave: body.wave,
      once: body.once,
      attach: body.attach,
      client_msg_id: body.client_msg_id,
      reply_to: body.reply_to,
      silent: body.silent,
    })
  }
  if (op === 'chat-voice-audio' || op === 'chat-voice-text' || op === 'chat-attach') {
    const kind = coachChatKind(body.kind)
    return handleStaffChatPost(ctx, res, { op: op.slice('chat-'.length), kind, client_id: body.client_id, message_id: body.message_id })
  }
  if (op === 'dm-voice-audio' || op === 'dm-voice-text') {
    return sendStaffDmVoice(ctx, res, body.user_id, body.message_id, op === 'dm-voice-text' ? 'text' : 'audio')
  }
  if (op === 'dm-attach') return sendStaffDmVoice(ctx, res, body.user_id, body.message_id, 'file')
  if (op === 'chat-react') {
    const kind = coachChatKind(body.kind)
    return handleStaffChatPost(ctx, res, { op: 'react', kind, client_id: body.client_id, message_id: body.message_id, emoji: body.emoji })
  }
  if (op === 'dm-send') {
    const { body: text, sticker, parts, audio, trim, sec, wave, once, attach, client_msg_id, reply_to, silent } = body
    return sendStaffDmMessage(ctx, res, body.user_id, { body: text, sticker, parts, audio, trim, sec, wave, once, attach, client_msg_id, reply_to, silent })
  }
  if (op === 'dm-react') return reactStaffDmMessage(ctx, res, body.user_id, { message_id: body.message_id, emoji: body.emoji })
  if (op.startsWith('group-')) return handleStaffGroupPost(ctx, res, op, body)
  if (op === 'client-invite') {
    const out = await issueClientInvite(ctx, { client_id: body.client_id })
    return sendJson(res, out.status, out.body)
  }
  if (op === 'push-subscribe' || op === 'push-unsubscribe') {
    const { endpoint, p256dh, auth, user_agent } = body
    return handlePushSubscriptionPost(
      { ...ctx, pushApp: PUSH_APP_COACH },
      res,
      { op: op === 'push-subscribe' ? 'subscribe' : 'unsubscribe', endpoint, p256dh, auth, user_agent, club_id: ctx.profile?.club_id ?? null },
    )
  }
  if (op === 'push-prefs') {
    return handlePushSubscriptionPost(ctx, res, { op: 'prefs', endpoint: body.endpoint, schedule_reminders: body.schedule_reminders })
  }
  sendJson(res, 400, { error: 'Неизвестное действие' })
}

export function createCoachHandler(auth = requireCoachUser, store = coachStore) {
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
    const manifestClub = req.method === 'GET' ? req.query?.manifest : null
    if (manifestClub != null) {
      if (!coachManifestUrl(manifestClub)) return sendJson(res, 400, { error: 'Неверный клуб' })
      return sendManifest(res, String(manifestClub).trim(), store)
    }
    const ctx = await auth(req, res)
    if (!ctx) return
    if (req.method === 'GET') return handleGet(ctx, req, res, store)
    return handlePost(ctx, res, isVideoUpload(req) ? videoSendBody(req, VIDEO_OPS_COACH) : parseBody(req.body), store)
  }
}
