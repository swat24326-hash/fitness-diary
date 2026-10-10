/**
 * Подменная переписка для автотестов экрана: /api/client-me { action: 'chat-*' } и admin-data?action=chat.
 * Доступ, текст, «непрочитано» и вид сообщения — те же чистые функции, что и на сервере.
 */
import {
  CHAT_NO_ACCESS_RU,
  canStaffReadChat,
  canStaffWriteChat,
  chatKindLabelRu,
  chatPeerReadAt,
  chatUnreadCount,
  clientChatKinds,
  isChatUnreadFor,
} from '../../../src/lib/chat/chatAccessCore.js'
import { buildChatMessageView, chatPreview } from '../../../src/lib/chat/chatMessageCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'

function staffCtx(user) {
  const role = String(user?.role ?? '')
  return {
    isAdmin: role === 'admin',
    isTrainer: role === 'trainer',
    isSalesManager: role === 'sales_manager',
    isSupervisor: role === 'supervisor',
    user: { id: user?.id },
    profile: { club_id: user?.club_id },
  }
}

/** @param {{ users: object[], clients: object[] }} state */
export function createFakeChat(state) {
  const chat = { threads: [], messages: [] }
  const names = () => new Map(state.users.map((u) => [String(u.id), u.name]))
  const threadOf = (clientId, kind) => chat.threads.find((t) => t.client_id === clientId && t.kind === kind)

  function page(thread, side) {
    if (!thread) return { messages: [], has_more: false, marked_read: false, peer_read_at: null }
    const marked = isChatUnreadFor(side, thread)
    if (marked) {
      thread[side === 'client' ? 'client_read_at' : 'staff_read_at'] = new Date().toISOString()
      thread[side === 'client' ? 'client_unread' : 'staff_unread'] = 0
    }
    const list = chat.messages.filter((m) => m.thread_id === thread.id).map((m) => buildChatMessageView(m, side, names()))
    return { messages: list, has_more: false, marked_read: marked, peer_read_at: chatPeerReadAt(side, thread) }
  }

  function send(client, kind, side, userId, input) {
    const checked = resolveChatOutgoing(input)
    if (!checked.ok) return { status: 400, json: { error: checked.error } }
    let thread = threadOf(client.id, kind)
    if (!thread) {
      thread = { id: `th-${chat.threads.length + 1}`, client_id: client.id, club_id: client.club_id, kind, client_unread: 0, staff_unread: 0 }
      chat.threads.push(thread)
    }
    const at = new Date(Date.now() + chat.messages.length).toISOString()
    const m = { id: `m-${chat.messages.length + 1}`, thread_id: thread.id, author_side: side, author_user_id: userId ?? null, body: checked.body, sticker: checked.sticker, created_at: at }
    chat.messages.push(m)
    const peerUnread = side === 'client' ? 'staff_unread' : 'client_unread'
    Object.assign(thread, {
      last_message_at: at,
      last_author: side,
      last_preview: chatPreview(checked.body),
      [side === 'client' ? 'client_read_at' : 'staff_read_at']: at,
      [side === 'client' ? 'client_unread' : 'staff_unread']: 0,
      [peerUnread]: thread[peerUnread] + 1,
    })
    return { status: 200, json: { message: buildChatMessageView(m, side, names()) } }
  }

  /** Ветки клиента; null — не чат, пусть ответит основной подменный портал. */
  function client(clientId, body) {
    const row = state.clients.find((c) => c.id === clientId)
    const kind = String(body?.kind ?? '')
    if (body.action === 'chat-list') {
      const threads = clientChatKinds(row).map((k) => {
        const t = threadOf(clientId, k)
        return {
          kind: k,
          label: chatKindLabelRu(k),
          name: k === 'trainer' ? names().get(String(row.trainer_id)) ?? '' : '',
          last_preview: t?.last_preview ?? '',
          last_message_at: t?.last_message_at ?? null,
          last_author: t?.last_author ?? null,
          unread: isChatUnreadFor('client', t),
          unread_count: chatUnreadCount('client', t),
        }
      })
      return { status: 200, json: { threads, attention: threads.filter((t) => t.unread).length } }
    }
    if (body.action === 'chat-thread') {
      return { status: 200, json: { ...page(threadOf(clientId, kind), 'client'), kind, name: names().get(String(row.trainer_id)) ?? '' } }
    }
    if (body.action === 'chat-send') return send(row, kind, 'client', null, body)
    return null
  }

  function attentionForClient(clientId) {
    return chat.threads.filter((t) => t.client_id === clientId && isChatUnreadFor('client', t)).length
  }

  function staff(req, user) {
    if (req.searchParams.get('action') !== 'chat') return null
    const ctx = staffCtx(user)
    const find = (id) => state.clients.find((c) => c.id === id)
    if (req.method === 'POST') {
      const row = find(req.body?.client_id)
      if (!canStaffWriteChat(ctx, req.body?.kind, row)) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
      return send(row, req.body.kind, 'staff', user.id, req.body)
    }
    if ((req.searchParams.get('view') || 'list') === 'list') {
      const threads = chat.threads
        .filter((t) => t.last_message_at && canStaffReadChat(ctx, t.kind, find(t.client_id)))
        .map((t) => ({
          client_id: t.client_id,
          client_name: find(t.client_id)?.name ?? '',
          kind: t.kind,
          label: chatKindLabelRu(t.kind),
          last_preview: t.last_preview,
          last_message_at: t.last_message_at,
          last_author: t.last_author,
          unread: isChatUnreadFor('staff', t),
          unread_count: chatUnreadCount('staff', t),
        }))
      return { status: 200, json: { threads, attention: threads.filter((t) => t.unread).length } }
    }
    const kind = req.searchParams.get('kind')
    const row = find(req.searchParams.get('client_id'))
    if (!canStaffReadChat(ctx, kind, row)) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
    return {
      status: 200,
      json: {
        client: { id: row.id, name: row.name, archived: false },
        kind,
        label: chatKindLabelRu(kind),
        can_write: canStaffWriteChat(ctx, kind, row),
        ...page(threadOf(row.id, kind), 'staff'),
      },
    }
  }

  return { state: chat, client, staff, attentionForClient }
}
