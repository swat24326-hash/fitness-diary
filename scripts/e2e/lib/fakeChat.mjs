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
  chatStaffRole,
  chatUnreadCount,
  clientChatKinds,
  isChatUnreadFor,
} from '../../../src/lib/chat/chatAccessCore.js'
import {
  CHAT_FOLDER_ADMIN,
  CHAT_FOLDER_CLIENTS,
  CHAT_FOLDER_COLLEAGUES,
  CHAT_FOLDER_COMPLAINTS,
  buildClientContacts,
  buildThreadContacts,
  chatFolderLabelRu,
  chatFolderUnread,
  sortChatContacts,
} from '../../../src/lib/chat/chatContactsCore.js'
import {
  buildStaffDmMessageView,
  buildStaffDmPushPayload,
  canReadStaffDm,
  pickStaffDmPeers,
  staffDmPair,
  staffDmRoleOf,
  staffDmSideOf,
  staffDmThreadForViewer,
  staffDmWriteAccess,
  staffRoleLabelRu,
} from '../../../src/lib/chat/staffDmAccessCore.js'
import { hiddenLinkedTrainerIds, linkedSupervisorFor } from '../../../src/lib/chat/linkedStaffCore.js'
import { buildStaffContacts } from '../../../src/lib/chat/staffDmContactsCore.js'
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
  const chat = { threads: [], messages: [], dm: { threads: [], messages: [], pushes: [] } }
  const names = () => new Map(state.users.map((u) => [String(u.id), u.name]))
  const threadOf = (clientId, kind) => chat.threads.find((t) => t.client_id === clientId && t.kind === kind)
  /** Как linkedStaffStore: тренерская учётка, связанная с управляющим, → строка управляющего. */
  const linkedSup = (user) => {
    const me = state.users.find((u) => u.id === user?.id)
    return me ? linkedSupervisorFor(me, state.users.find((u) => u.id === me.linked_user_id) ?? null) : null
  }
  const dmUser = (user) => linkedSup(user) ?? user
  const actorFor = (user, kind) => (kind === 'supervisor' && linkedSup(user)) || user

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

  const folderOf = (id, role, contacts) => {
    const list = sortChatContacts(contacts)
    return { id, label: chatFolderLabelRu(id, role), unread: chatFolderUnread(list), contacts: list }
  }

  function clientsFolder(role, user) {
    if (role !== 'trainer') return null
    const clients = state.clients.filter((c) => c.trainer_id === user.id && !c.archived_at)
    const own = new Set(clients.map((c) => c.id))
    return folderOf(
      CHAT_FOLDER_CLIENTS,
      role,
      buildClientContacts({
        clients,
        liveClientIds: (state.client_sessions ?? []).filter((s) => !s.revoked_at && own.has(s.client_id)).map((s) => s.client_id),
        threads: chat.threads.filter((t) => t.kind === 'trainer' && own.has(t.client_id)),
      }),
    )
  }

  const complaintThreads = (user) => {
    const sup = role(user) === 'trainer' ? linkedSup(user) : null
    if (!sup) return null
    return chat.threads.filter((t) => t.kind === 'supervisor' && t.last_message_at && canStaffReadChat(staffCtx(sup), t.kind, find(t.client_id)))
  }
  const role = (user) => chatStaffRole(staffCtx(user))
  const find = (id) => state.clients.find((c) => c.id === id)

  /** Как chatContactsHandler: «Клиенты» у тренера + «Коллеги»/«Тренеры» и «Администрация» (живые — state.live_user_ids) + «Жалобы и предложения» у связанного. */
  function contacts(ctx, user) {
    const viewerRole = chatStaffRole(ctx)
    if (!viewerRole) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
    const viewer = dmViewer(dmUser(user))
    const hidden = hiddenLinkedTrainerIds(state.users)
    const staff =
      staffDmRoleOf(viewer.role) && viewer.club_id
        ? buildStaffContacts({
            viewerId: viewer.id,
            peers: pickStaffDmPeers(viewer, state.users).filter((p) => !hidden.has(String(p.id))),
            liveUserIds: state.live_user_ids ?? [],
            threads: chat.dm.threads,
          })
        : null
    const complaints = complaintThreads(user)
    const clientNames = new Map(state.clients.map((c) => [c.id, c]))
    const folders = [
      clientsFolder(viewerRole, user),
      staff ? folderOf(CHAT_FOLDER_COLLEAGUES, viewerRole, staff.colleagues) : null,
      staff ? folderOf(CHAT_FOLDER_ADMIN, viewerRole, staff.admin) : null,
      complaints ? folderOf(CHAT_FOLDER_COMPLAINTS, viewerRole, buildThreadContacts(complaints, clientNames)) : null,
    ].filter(Boolean)
    return { status: 200, json: { role: viewerRole, folders } }
  }

  const dmViewer = (user) => ({ id: String(user?.id ?? ''), role: user?.role, club_id: user?.club_id })
  const dmPeer = (id) => state.users.find((u) => u.id === id) ?? null
  const dmThreadOf = (a, b) => {
    const pair = staffDmPair(a, b)
    return chat.dm.threads.find((t) => t.user_lo === pair.user_lo && t.user_hi === pair.user_hi)
  }

  /** Как staffDmHandler.sendStaffDmThread. */
  function dmThread(authUser, peerId) {
    const viewer = dmViewer(dmUser(authUser))
    const peer = dmPeer(peerId)
    if (!peer) return { status: 404, json: { error: 'Сотрудник не найден' } }
    const thread = dmThreadOf(viewer.id, peer.id)
    if (!canReadStaffDm(viewer, peer, Boolean(thread))) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
    const meta = {
      peer: { id: peer.id, name: peer.name, label: staffRoleLabelRu(peer.role) },
      can_write: staffDmWriteAccess(viewer, peer).ok,
    }
    if (!thread) return { status: 200, json: { ...meta, messages: [], has_more: false, marked_read: false, peer_read_at: null } }
    const view = staffDmThreadForViewer(thread, viewer.id)
    const marked = isChatUnreadFor('staff', view)
    if (marked) {
      const side = staffDmSideOf(thread, viewer.id)
      Object.assign(thread, { [`${side}_read_at`]: new Date().toISOString(), [`${side}_unread`]: 0 })
    }
    const messages = chat.dm.messages.filter((m) => m.thread_id === thread.id).map((m) => buildStaffDmMessageView(m, viewer.id))
    return { status: 200, json: { ...meta, messages, has_more: false, marked_read: marked, peer_read_at: chatPeerReadAt('staff', view) } }
  }

  /** Как staffDmHandler.sendStaffDmMessage; push не шлём, а складываем в chat.dm.pushes. */
  function dmSend(authUser, peerId, input) {
    const user = dmUser(authUser)
    const viewer = dmViewer(user)
    const peer = dmPeer(peerId)
    const access = staffDmWriteAccess(viewer, peer)
    if (!access.ok) return { status: access.status, json: { error: access.error } }
    const checked = resolveChatOutgoing(input)
    if (!checked.ok) return { status: 400, json: { error: checked.error } }
    let thread = dmThreadOf(viewer.id, peer.id)
    if (!thread) {
      thread = { id: `dm-${chat.dm.threads.length + 1}`, ...staffDmPair(viewer.id, peer.id), lo_unread: 0, hi_unread: 0 }
      chat.dm.threads.push(thread)
    }
    const at = new Date(Date.now() + chat.dm.messages.length).toISOString()
    const m = { id: `dmm-${chat.dm.messages.length + 1}`, thread_id: thread.id, author_user_id: viewer.id, body: checked.body, sticker: checked.sticker, created_at: at }
    chat.dm.messages.push(m)
    const side = staffDmSideOf(thread, viewer.id)
    const other = side === 'lo' ? 'hi' : 'lo'
    Object.assign(thread, {
      last_message_at: at,
      last_author: viewer.id,
      last_preview: chatPreview(checked.body),
      [`${side}_read_at`]: at,
      [`${side}_unread`]: 0,
      [`${other}_unread`]: (thread[`${other}_unread`] || 0) + 1,
    })
    chat.dm.pushes.push({ to: peer.id, ...buildStaffDmPushPayload({ authorId: viewer.id, authorName: user.name, body: checked.body }) })
    return { status: 200, json: { message: buildStaffDmMessageView(m, viewer.id) } }
  }

  const dmAttention = (authUser) => {
    const user = dmUser(authUser)
    return chat.dm.threads.filter((t) => staffDmSideOf(t, user.id) && isChatUnreadFor('staff', staffDmThreadForViewer(t, user.id))).length
  }

  function staff(req, user) {
    if (req.searchParams.get('action') !== 'chat') return null
    const ctx = staffCtx(user)
    if (req.method === 'POST' && req.body?.op === 'dm-send') return dmSend(user, req.body.user_id, req.body)
    if (req.searchParams.get('view') === 'dm-thread') return dmThread(user, req.searchParams.get('user_id'))
    if (req.method === 'POST') {
      const row = find(req.body?.client_id)
      const actor = actorFor(user, req.body?.kind)
      if (!canStaffWriteChat(staffCtx(actor), req.body?.kind, row)) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
      return send(row, req.body.kind, 'staff', actor.id, req.body)
    }
    if (req.searchParams.get('view') === 'contacts') return contacts(ctx, user)
    if ((req.searchParams.get('view') || 'list') === 'list') {
      const own = chat.threads.filter((t) => t.last_message_at && canStaffReadChat(ctx, t.kind, find(t.client_id)))
      const threads = [...own, ...(complaintThreads(user) ?? []).filter((t) => !own.includes(t))]
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
      return { status: 200, json: { threads, attention: threads.filter((t) => t.unread).length + dmAttention(user) } }
    }
    const kind = req.searchParams.get('kind')
    const row = find(req.searchParams.get('client_id'))
    const actorCtx = staffCtx(actorFor(user, kind))
    if (!canStaffReadChat(actorCtx, kind, row)) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
    return {
      status: 200,
      json: {
        client: { id: row.id, name: row.name, archived: false },
        kind,
        label: chatKindLabelRu(kind),
        can_write: canStaffWriteChat(actorCtx, kind, row),
        ...page(threadOf(row.id, kind), 'staff'),
      },
    }
  }

  return { state: chat, client, staff, attentionForClient }
}
