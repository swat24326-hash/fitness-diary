/**
 * admin-data?action=chat — переписка с клиентами для тренера, менеджера продаж, управляющего и админа.
 * GET  view=list → { threads, attention } (attention — ещё и личные диалоги сотрудников, ждущие ответа)
 * GET  view=contacts → папки «Клиенты · Коллеги · Администрация» (chatContactsHandler.js)
 * GET  view=dm-thread&user_id / POST { op: 'dm-send', user_id } — переписка сотрудников (staffDmHandler.js)
 * GET  view=thread&client_id&kind[&before][&seen=0] → { client, kind, can_write, messages, has_more } (отмечает прочитанным; seen=0 — нет)
 * POST { op: 'send', client_id, kind, body } → { message }
 * POST { op: 'react', client_id, kind, message_id, emoji|null } | { op: 'dm-react', user_id, message_id, emoji|null } → { message_id, reactions }
 *      (реакцию ставит тот, кто может писать в диалог)
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
import { openChatThread, reactChatMessage, sendChatMessage } from './chatConversation.js'
import { sendChatContacts } from './chatContactsHandler.js'
import { reactStaffDmMessage, sendStaffDmMessage, sendStaffDmThread, staffDmAttention } from './staffDmHandler.js'
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
  const scope = scopeOf(ctx, res)
  if (!scope) return
  try {
    if (view === 'list') {
      const [list, dm] = await Promise.all([listThreads(ctx, scope), staffDmAttention(ctx)])
      sendJson(res, 200, { ...list, attention: list.attention + dm })
      return
    }
    const kind = String(req.query?.kind ?? '')
    const found = await resolveClient(ctx, res, req.query?.client_id, kind, false)
    if (!found) return
    const { client, actor } = found
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
  const scope = scopeOf(ctx, res)
  if (!scope) return
  if (op !== 'send' && op !== 'react') {
    sendJson(res, 400, { error: 'Неизвестное действие' })
    return
  }
  const kind = String(body?.kind ?? '')
  try {
    const found = await resolveClient(ctx, res, body?.client_id, kind, true)
    if (!found) return
    const { client, actor } = found
    const userId = String(actor.user?.id ?? scope.userId)
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
      clientMsgId: body?.client_msg_id,
      replyTo: body?.reply_to,
    })
    sendJson(res, out.status, out.body)
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}
