/**
 * admin-data?action=chat — переписка с клиентами для тренера, менеджера продаж, управляющего и админа.
 * GET  view=list → { threads, attention } (attention — ещё и личные диалоги сотрудников, ждущие ответа;
 *      у главного админа threads пусто — клиентов он читает из карточки, конверт только про сотрудников)
 * GET  view=contacts → папки «Клиенты · Коллеги · Администрация» (chatContactsHandler.js)
 * GET  view=dm-thread&user_id / POST { op: 'dm-send', user_id } — переписка сотрудников (staffDmHandler.js)
 * GET  view=group-* / POST { op: 'group-*', club_id } — чат клуба (staffGroupRoutes.js)
 * GET  view=thread&client_id&kind[&before][&seen=0] → { client, kind, can_write, messages, has_more } (отмечает прочитанным; seen=0 — нет)
 * GET  view=search&client_id&kind&q | view=dm-search&user_id&q → { results: [{ id, created_at, who, snippet }] } — поиск по диалогу, новые сверху
 * POST { op: 'send', client_id, kind, body | sticker | (audio, sec, wave) } → { message } (audio — голосовое, base64 MP3)
 * POST { op: 'react', client_id, kind, message_id, emoji|null } | { op: 'dm-react', user_id, message_id, emoji|null } → { message_id, reactions }
 *      (реакцию ставит тот, кто может писать в диалог)
 * POST { op: 'voice-audio' | 'voice-text', client_id, kind, message_id } | { op: 'dm-voice-audio' | 'dm-voice-text', user_id, message_id }
 *      → { audio, mime } | { done, text? } — звук голосового (сутки) и расшифровка «→ Аа»; права — как на чтение диалога
 * POST { op: 'attach', client_id, kind, message_id } | { op: 'dm-attach', user_id, message_id } → { data, mime, name } — фото / PDF (сутки);
 *      в send / dm-send — attach { kind: 'photo'|'file', data (base64), name?, w?, h? }, body — подпись
 * Видеокружок — бинарный POST ?action=chat&op=send|dm-send|group-send&…&sec (chatVideoHandler.js); attach у видео отдаёт байты.
 * Тренер, связанный с управляющим (linkedStaffStore), ведёт «Жалобы и предложения» (kind supervisor) от учётки управляющего.
 */
import { sendJson } from '../adminSupabase.js'
import {
  CHAT_NO_ACCESS_RU,
  CHAT_NO_CLUB_RU,
  canStaffReadChat,
  canStaffWriteChat,
  chatKindLabelRu,
  chatKindsForStaff,
  chatStaffRole,
  chatUnreadCount,
  isStaffChatUnread,
} from '../../../src/lib/chat/chatAccessCore.js'
import { staffMarksChatRead } from '../../../src/lib/chat/chatDeliveryCore.js'
import { chatReactorKey, chatUnseenReaction } from '../../../src/lib/chat/chatReactionCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { sendChatFileAnswer } from './chatAttachHandler.js'
import { chatVoiceOf, openChatThread, reactChatMessage, searchChatThread, sendChatMessage } from './chatConversation.js'
import { sendChatContacts } from './chatContactsHandler.js'
import { reactStaffDmMessage, sendStaffDmMessage, sendStaffDmSearch, sendStaffDmThread, sendStaffDmVoice, staffDmAttention } from './staffDmHandler.js'
import { handleStaffGroupGet, handleStaffGroupPost, staffGroupsAttention } from './staffGroupRoutes.js'
import { isMissingChatTable, loadChatClient, loadClientsByIds, loadStaffThreads } from './chatStore.js'
import { linkedComplaintThreads, linkedSupervisorCtx } from './linkedStaffStore.js'

const UNAVAILABLE_RU = 'Сообщения пока недоступны — попробуйте позже'

function scopeOf(ctx, res) {
  const role = chatStaffRole(ctx)
  if (!role) {
    sendJson(res, 403, { error: CHAT_NO_ACCESS_RU })
    return null
  }
  const clubId = String(ctx.profile?.club_id ?? '').trim()
  if ((role === 'sales' || role === 'supervisor') && !clubId) {
    sendJson(res, 403, { error: CHAT_NO_CLUB_RU })
    return null
  }
  return { role, clubId, userId: String(ctx.user?.id ?? ''), kinds: chatKindsForStaff(ctx) }
}

async function listThreads(ctx, scope) {
  const db = ctx.supabaseAdmin
  const threads = [...(await loadStaffThreads(db, scope)), ...(await linkedComplaintThreads(ctx))]
  const clients = new Map((await loadClientsByIds(db, threads.map((t) => t.client_id))).map((c) => [String(c.id), c]))
  const out = []
  const seen = new Set()
  for (const t of threads) {
    const client = clients.get(String(t.client_id))
    if (seen.has(t.id) || !canStaffReadChat(t.actor ?? ctx, t.kind, client)) continue
    seen.add(t.id)
    const unread = isStaffChatUnread(t, client)
    out.push({
      client_id: String(t.client_id),
      client_name: client.name ?? '',
      kind: t.kind,
      label: chatKindLabelRu(t.kind),
      last_preview: t.last_preview ?? '',
      last_message_at: t.last_message_at,
      last_author: t.last_author,
      unread,
      unread_count: unread ? chatUnreadCount('staff', t) : 0,
      reaction: chatUnseenReaction('staff', t),
    })
  }
  out.sort((a, b) => Number(b.unread) - Number(a.unread) || String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
  return { threads: out, attention: out.filter((t) => t.unread).length }
}

/** «Жалобы и предложения» связанный тренер ведёт от учётки управляющего; остальное — от своей. */
async function actorFor(ctx, kind) {
  if (kind !== 'supervisor') return ctx
  return (await linkedSupervisorCtx(ctx)) ?? ctx
}

/** Клиент, вид диалога и от чьего имени; null — ответ уже отправлен. */
async function resolveClient(ctx, res, clientId, kind, write) {
  const actor = await actorFor(ctx, kind)
  const client = isInboxUuid(clientId) ? await loadChatClient(ctx.supabaseAdmin, String(clientId).trim()) : null
  const allowed = write ? canStaffWriteChat(actor, kind, client) : canStaffReadChat(actor, kind, client)
  if (!allowed) {
    sendJson(res, client ? 403 : 404, { error: client ? CHAT_NO_ACCESS_RU : 'Клиент не найден' })
    return null
  }
  return { client, actor }
}

export async function handleStaffChatGet(ctx, req, res) {
  const view = String(req.query?.view ?? 'list')
  if (view === 'contacts') return sendChatContacts(ctx, res)
  if (view === 'dm-thread') return sendStaffDmThread(ctx, res, req.query?.user_id, req.query?.before, req.query?.seen)
  if (view === 'dm-search') return sendStaffDmSearch(ctx, res, req.query?.user_id, req.query?.q)
  if (view.startsWith('group-')) return handleStaffGroupGet(ctx, res, view, req.query ?? {})
  const scope = scopeOf(ctx, res)
  if (!scope) return
  try {
    if (view === 'list') {
      const clients = scope.role === 'admin' ? Promise.resolve({ threads: [], attention: 0 }) : listThreads(ctx, scope)
      const [list, dm, group] = await Promise.all([clients, staffDmAttention(ctx), staffGroupsAttention(ctx)])
      sendJson(res, 200, { ...list, attention: list.attention + dm + group })
      return
    }
    const kind = String(req.query?.kind ?? '')
    const found = await resolveClient(ctx, res, req.query?.client_id, kind, false)
    if (!found) return
    const { client, actor } = found
    if (view === 'search') {
      const out = await searchChatThread(ctx.supabaseAdmin, { client, kind, side: 'staff', q: req.query?.q })
      sendJson(res, out.status, out.body)
      return
    }
    const page = await openChatThread(ctx.supabaseAdmin, {
      client,
      kind,
      side: 'staff',
      reactor: chatReactorKey('staff', actor.user?.id ?? scope.userId),
      before: req.query?.before,
      markRead: staffMarksChatRead(scope.role) && chatSeenFromRequest(req.query?.seen),
    })
    sendJson(res, 200, {
      client: { id: String(client.id), name: client.name ?? '', archived: Boolean(client.archived_at), archived_at: client.archived_at ?? null },
      kind,
      label: chatKindLabelRu(kind),
      can_write: canStaffWriteChat(actor, kind, client),
      ...page,
    })
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    if (String(req.query?.view ?? 'list') === 'list') sendJson(res, 200, { threads: [], attention: 0 })
    else sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}

export async function handleStaffChatPost(ctx, res, body) {
  const op = String(body?.op ?? '')
  if (op === 'dm-send') return sendStaffDmMessage(ctx, res, body?.user_id, body)
  if (op === 'dm-react') return reactStaffDmMessage(ctx, res, body?.user_id, body)
  if (op === 'dm-voice-audio' || op === 'dm-voice-text') {
    return sendStaffDmVoice(ctx, res, body?.user_id, body?.message_id, op === 'dm-voice-text' ? 'text' : 'audio')
  }
  if (op === 'dm-attach') return sendStaffDmVoice(ctx, res, body?.user_id, body?.message_id, 'file')
  if (op.startsWith('group-')) return handleStaffGroupPost(ctx, res, op, body ?? {})
  const scope = scopeOf(ctx, res)
  if (!scope) return
  const voiceWant = op === 'voice-audio' ? 'audio' : op === 'voice-text' ? 'text' : op === 'attach' ? 'file' : null
  if (op !== 'send' && op !== 'react' && !voiceWant) {
    sendJson(res, 400, { error: 'Неизвестное действие' })
    return
  }
  const kind = String(body?.kind ?? '')
  try {
    const found = await resolveClient(ctx, res, body?.client_id, kind, !voiceWant)
    if (!found) return
    const { client, actor } = found
    const userId = String(actor.user?.id ?? scope.userId)
    if (voiceWant) {
      const out = await chatVoiceOf(ctx.supabaseAdmin, {
        client,
        kind,
        messageId: body?.message_id,
        want: voiceWant,
        who: `u:${scope.userId}`,
        side: 'staff',
        mark: staffMarksChatRead(scope.role),
      })
      sendChatFileAnswer(res, out)
      return
    }
    if (op === 'react') {
      const reactor = chatReactorKey('staff', userId)
      const out = await reactChatMessage(ctx.supabaseAdmin, { client, kind, reactor, messageId: body?.message_id, emoji: body?.emoji })
      sendJson(res, out.status, out.body)
      return
    }
    const out = await sendChatMessage(ctx.supabaseAdmin, {
      client,
      kind,
      side: 'staff',
      userId,
      body: body?.body,
      sticker: body?.sticker,
      voice: { parts: body?.parts, audio: body?.audio, trim: body?.trim, sec: body?.sec, wave: body?.wave, once: body?.once },
      attach: body?.attach,
      clientMsgId: body?.client_msg_id,
      replyTo: body?.reply_to,
      silent: body?.silent === true,
    })
    sendJson(res, out.status, out.body)
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}
