/**
 * admin-data?action=chat — переписка с клиентами для тренера, менеджера продаж, управляющего и админа.
 * GET  view=list → { threads, attention }
 * GET  view=thread&client_id&kind[&before] → { client, kind, can_write, messages, has_more } (отмечает прочитанным)
 * POST { op: 'send', client_id, kind, body } → { message }
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
  isChatUnreadFor,
} from '../../../src/lib/chat/chatAccessCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { openChatThread, sendChatMessage } from './chatConversation.js'
import { isMissingChatTable, loadChatClient, loadClientsByIds, loadStaffThreads } from './chatStore.js'

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
  const threads = await loadStaffThreads(db, scope)
  const clients = new Map((await loadClientsByIds(db, threads.map((t) => t.client_id))).map((c) => [String(c.id), c]))
  const out = []
  for (const t of threads) {
    const client = clients.get(String(t.client_id))
    if (!canStaffReadChat(ctx, t.kind, client)) continue
    out.push({
      client_id: String(t.client_id),
      client_name: client.name ?? '',
      kind: t.kind,
      label: chatKindLabelRu(t.kind),
      last_preview: t.last_preview ?? '',
      last_message_at: t.last_message_at,
      last_author: t.last_author,
      unread: isChatUnreadFor('staff', t),
      unread_count: chatUnreadCount('staff', t),
    })
  }
  out.sort((a, b) => Number(b.unread) - Number(a.unread))
  return { threads: out, attention: out.filter((t) => t.unread).length }
}

/** Клиент и вид диалога из запроса; null — ответ уже отправлен. */
async function resolveClient(ctx, res, clientId, kind, write) {
  const client = isInboxUuid(clientId) ? await loadChatClient(ctx.supabaseAdmin, String(clientId).trim()) : null
  const allowed = write ? canStaffWriteChat(ctx, kind, client) : canStaffReadChat(ctx, kind, client)
  if (!allowed) {
    sendJson(res, client ? 403 : 404, { error: client ? CHAT_NO_ACCESS_RU : 'Клиент не найден' })
    return null
  }
  return client
}

export async function handleStaffChatGet(ctx, req, res) {
  const scope = scopeOf(ctx, res)
  if (!scope) return
  try {
    if (String(req.query?.view ?? 'list') === 'list') {
      sendJson(res, 200, await listThreads(ctx, scope))
      return
    }
    const kind = String(req.query?.kind ?? '')
    const client = await resolveClient(ctx, res, req.query?.client_id, kind, false)
    if (!client) return
    const page = await openChatThread(ctx.supabaseAdmin, { client, kind, side: 'staff', before: req.query?.before })
    sendJson(res, 200, {
      client: { id: String(client.id), name: client.name ?? '', archived: Boolean(client.archived_at) },
      kind,
      label: chatKindLabelRu(kind),
      can_write: canStaffWriteChat(ctx, kind, client),
      ...page,
    })
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    if (String(req.query?.view ?? 'list') === 'list') sendJson(res, 200, { threads: [], attention: 0 })
    else sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}

export async function handleStaffChatPost(ctx, res, body) {
  const scope = scopeOf(ctx, res)
  if (!scope) return
  if (String(body?.op ?? '') !== 'send') {
    sendJson(res, 400, { error: 'Неизвестное действие' })
    return
  }
  const kind = String(body?.kind ?? '')
  try {
    const client = await resolveClient(ctx, res, body?.client_id, kind, true)
    if (!client) return
    const out = await sendChatMessage(ctx.supabaseAdmin, { client, kind, side: 'staff', userId: scope.userId, body: body?.body, sticker: body?.sticker })
    sendJson(res, out.status, out.body)
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}
