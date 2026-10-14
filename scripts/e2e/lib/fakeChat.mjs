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
import {
  LINKED_ROLE_LABEL_RU,
  hiddenLinkedTrainerIds,
  linkedPersonNames,
  linkedSupervisorFor,
} from '../../../src/lib/chat/linkedStaffCore.js'
import { buildStaffContacts } from '../../../src/lib/chat/staffDmContactsCore.js'
import { buildChatMessageView, chatPreview } from '../../../src/lib/chat/chatMessageCore.js'
import {
  CHAT_REACTION_GONE_RU,
  chatReactionNotifies,
  chatReactionsByMessage,
  chatReactorKey,
  chatReactorSide,
  chatUnseenReaction,
  normalizeChatReaction,
  summarizeChatReactions,
} from '../../../src/lib/chat/chatReactionCore.js'
import { randomUUID } from 'node:crypto'
import { noteVoicePlayed, onceVoiceAnswer, voiceAudioAnswer, voiceTextAnswer } from '../../../api/_lib/chat/chatVoiceHandler.js'
import { voiceColumns } from '../../../api/_lib/chat/chatStore.js'
import { attachFileAnswer } from '../../../api/_lib/chat/chatAttachHandler.js'
import { attachColumns } from '../../../api/_lib/chat/chatAttachStore.js'
import { CHAT_ATTACH_BAD_RU, attachStorageKey, checkAttachBytes } from '../../../src/lib/chat/chatAttachCore.js'
import { CHAT_VOICE_BAD_RU, isMp3Header, voiceOnceRefusal, voiceStorageKey } from '../../../src/lib/chat/chatVoiceCore.js'
import { chatReplyQuoteFor } from '../../../src/lib/chat/chatReplyCore.js'
import { buildChatSearchHit, CHAT_SEARCH_LIMIT, chatTextMatches, normalizeChatSearchQuery } from '../../../src/lib/chat/chatSearchCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import { staffGroupAttention } from '../../../src/lib/chat/staffGroupCore.js'
import { createFakeStaffGroup } from './fakeStaffGroup.mjs'

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
  const chat = {
    threads: [], messages: [], reactions: [], dm: { threads: [], messages: [], pushes: [] },
    /** Голосовые: звук по ключу (как бакет), voiceReady — хранилище настроено, voiceText — что «распознает» SpeechKit. */
    voices: new Map(),
    voiceReady: true,
    voiceText: 'Купите резинку средней жёсткости.',
    voiceTextStarts: 0,
    /** id сообщений, отправленных «без звука» (push у собеседника был бы тихим). */
    silentSends: [],
  }
  const group = createFakeStaffGroup(state)
  chat.group = group.state
  /** Как storeChatVoice: только MP3, файл под ключом автора. */
  function storeVoice(checked) {
    if (checked.attach) return storeAttach(checked.attach)
    if (!checked.voice) return { ok: true, columns: {} }
    if (!chat.voiceReady) return { ok: false, status: 503, error: 'Голосовые пока недоступны' }
    const bytes = Buffer.from(checked.voice.audio, 'base64')
    if (!isMp3Header(bytes)) return { ok: false, status: 400, error: CHAT_VOICE_BAD_RU }
    const key = voiceStorageKey('client', randomUUID(), randomUUID())
    chat.voices.set(key, bytes)
    return { ok: true, columns: voiceColumns({ key, sec: checked.voice.sec, wave: checked.voice.wave, once: checked.voice.once }) }
  }
  /** Как storeChatAttach: тип по байтам, файл в chat.voices под ключом voice/att/…. */
  function storeAttach(attach) {
    if (!chat.voiceReady) return { ok: false, status: 503, error: 'Фото и файлы пока недоступны' }
    const bytes = Buffer.from(attach.data, 'base64')
    const mime = checkAttachBytes(attach.kind, bytes)
    if (!mime) return { ok: false, status: 400, error: CHAT_ATTACH_BAD_RU }
    const key = attachStorageKey('client', randomUUID(), randomUUID(), mime)
    chat.voices.set(key, bytes)
    const { kind, name, w, h, caption } = attach
    return { ok: true, columns: attachColumns({ kind, key, mime, bytes: bytes.length, name, w, h, caption }) }
  }
  /** Как answerChatAttach: только сообщение этого диалога; сутки — по created_at. */
  function fileOf(messages, thread, messageId) {
    const message = thread && messages.find((m) => m.id === messageId && m.thread_id === thread.id)
    return attachFileAnswer(message ?? null, async (key) => chat.voices.get(key) ?? null).then((out) => ({ status: out.status, json: out.body }))
  }
  /**
   * Как answerChatVoice: тот же код ответа, вместо бакета — chat.voices, вместо SpeechKit — chat.voiceText со второго опроса.
   * Звук отдан собеседнику автора — «прослушано» (listener — как на сервере).
   */
  function voiceOf(messages, thread, messageId, want, who, listener) {
    const message = thread && messages.find((m) => m.id === messageId && m.thread_id === thread.id)
    const answer = (out) => ({ status: out.status, json: out.body })
    const get = async (key) => chat.voices.get(key) ?? null
    const refused = voiceOnceRefusal(message, listener, want)
    if (refused) return Promise.resolve({ status: refused.status, json: { error: refused.error } })
    if (want === 'audio') {
      return voiceAudioAnswer(message ?? null, get).then(async (out) => {
        if (out.status !== 200) return answer(out)
        if (message.voice_once === true) {
          return answer(
            await onceVoiceAnswer(out, async () => {
              if (message.voice_played_at) return false
              Object.assign(message, { voice_played_at: new Date().toISOString(), voice_key: null })
              return true
            }),
          )
        }
        await noteVoicePlayed(message, listener, async () => (message.voice_played_at = new Date().toISOString()))
        return answer(out)
      })
    }
    return voiceTextAnswer(message ?? null, who, {
      save: async (patch) => Object.assign(message, patch),
      get,
      start: async () => {
        chat.voiceTextStarts += 1
        return { ok: true, id: `op-${chat.voiceTextStarts}` }
      },
      poll: async () => ({ ok: true, done: true, text: chat.voiceText }),
      env: { YANDEX_FOLDER_ID: 'e2e-folder', YANDEX_LLM_API_KEY: 'e2e-key' },
    }).then(answer)
  }
  const names = () => new Map(state.users.map((u) => [String(u.id), u.name]))
  const threadOf = (clientId, kind) => chat.threads.find((t) => t.client_id === clientId && t.kind === kind)
  /** Как linkedStaffStore: тренерская учётка, связанная с управляющим, → строка управляющего. */
  const linkedSup = (user) => {
    const me = state.users.find((u) => u.id === user?.id)
    return me ? linkedSupervisorFor(me, state.users.find((u) => u.id === me.linked_user_id) ?? null) : null
  }
  const dmUser = (user) => linkedSup(user) ?? user
  const actorFor = (user, kind) => (kind === 'supervisor' && linkedSup(user)) || user

  /** chat.pageSize — как CHAT_PAGE на сервере (по умолчанию вся лента одной страницей); before — «Раньше». */
  function page(thread, side, seen = true, reactor = '', before = null) {
    const voice_ready = chat.voiceReady
    if (!thread) return { messages: [], has_more: false, marked_read: false, peer_read_at: null, voice_ready }
    const all = chat.messages.filter((m) => m.thread_id === thread.id && (!before || m.created_at < before))
    const size = chat.pageSize ?? Infinity
    const shown = all.slice(-size)
    if (before) seen = false
    const marked = chatSeenFromRequest(seen) && isChatUnreadFor(side, thread)
    if (marked) {
      thread[side === 'client' ? 'client_read_at' : 'staff_read_at'] = new Date().toISOString()
      thread[side === 'client' ? 'client_unread' : 'staff_unread'] = 0
    }
    if (chatSeenFromRequest(seen) && chatUnseenReaction(side, thread)) thread[`${side}_reaction_seen_at`] = new Date().toISOString()
    const reactions = chatReactionsByMessage(chat.reactions, reactor, reactorNames())
    const list = shown.map((m) => ({ ...chatView(m, side), reactions: reactions.get(m.id) ?? [] }))
    return { messages: list, has_more: all.length > shown.length, marked_read: marked, peer_read_at: chatPeerReadAt(side, thread), voice_ready }
  }

  /** reactor → имя, как chatReactionStore. */
  const reactorNames = () =>
    new Map([
      ...state.users.map((u) => [chatReactorKey('staff', u.id), u.name]),
      ...state.clients.map((c) => [chatReactorKey('client', c.id), c.name]),
    ])

  /**
   * Как chatReactionStore.setMessageReaction: сообщение из этого диалога, одна реакция от человека,
   * значок в списке у автора сообщения. authorKey(m) — сторона (переписка с клиентом) или 'u:<id>' (сотрудники).
   */
  function react(thread, messages, messageId, reactor, raw, authorKey) {
    const checked = normalizeChatReaction(raw)
    if (!checked.ok) return { status: 400, json: { error: checked.error } }
    const message = thread && messages.find((m) => m.id === messageId && m.thread_id === thread.id)
    if (!message) return { status: 404, json: { error: CHAT_REACTION_GONE_RU } }
    chat.reactions = chat.reactions.filter((r) => !(r.message_id === messageId && r.reactor === reactor))
    if (checked.emoji) chat.reactions.push({ message_id: messageId, reactor, emoji: checked.emoji })
    const dm = String(authorKey(message)).startsWith('u:')
    if (checked.emoji && chatReactionNotifies(authorKey(message), dm ? reactor : chatReactorSide(reactor))) {
      Object.assign(thread, { last_reaction_at: new Date().toISOString(), last_reaction_emoji: checked.emoji, last_reaction_by: reactor })
    } else if (!checked.emoji && thread.last_reaction_by === reactor) {
      Object.assign(thread, { last_reaction_at: null, last_reaction_emoji: null, last_reaction_by: null })
    }
    const mine = chat.reactions.filter((r) => r.message_id === messageId)
    return { status: 200, json: { message_id: messageId, reactions: summarizeChatReactions(mine, reactor, reactorNames()) } }
  }
  /** Как chatReplyStore: ответ только на сообщение этого диалога, иначе без цитаты. */
  const replyIn = (messages, thread, id) => messages.find((x) => x.id === id && x.thread_id === thread.id)?.id ?? null
  const byId = (messages) => new Map(messages.map((x) => [x.id, x]))
  function chatView(m, side) {
    const toView = (x) => buildChatMessageView(x, side, names())
    const peerName = side === 'staff' ? find(chat.threads.find((t) => t.id === m.thread_id)?.client_id)?.name ?? '' : ''
    return { ...toView(m), reply: chatReplyQuoteFor(m, byId(chat.messages), toView, peerName) }
  }
  function dmView(m, viewerId, peerName) {
    const toView = (x) => buildStaffDmMessageView(x, viewerId)
    return { ...toView(m), reply: chatReplyQuoteFor(m, byId(chat.dm.messages), toView, peerName) }
  }
  /** Как chatConversation.searchChatThread: новые сверху, не больше CHAT_SEARCH_LIMIT. */
  function search(messages, thread, raw, toView, peerName) {
    const checked = normalizeChatSearchQuery(raw)
    if (!checked.ok) return { status: 400, json: { error: checked.error } }
    const results = messages
      .filter((m) => thread && m.thread_id === thread.id && m.body && chatTextMatches(m.body, checked.q))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, CHAT_SEARCH_LIMIT)
      .map((m) => buildChatSearchHit(toView(m), checked.q, peerName))
    return { status: 200, json: { results } }
  }
  const chatAuthor = (m) => m.author_side
  const dmAuthor = (m) => `u:${m.author_user_id}`

  function send(client, kind, side, userId, input) {
    const checked = resolveChatOutgoing(input)
    if (!checked.ok) return { status: checked.status ?? 400, json: { error: checked.error } }
    const stored = storeVoice(checked)
    if (!stored.ok) return { status: stored.status, json: { error: stored.error } }
    let thread = threadOf(client.id, kind)
    if (!thread) {
      thread = { id: `th-${chat.threads.length + 1}`, client_id: client.id, club_id: client.club_id, kind, client_unread: 0, staff_unread: 0 }
      chat.threads.push(thread)
    }
    const at = new Date(Date.now() + chat.messages.length).toISOString()
    const m = { id: `m-${chat.messages.length + 1}`, thread_id: thread.id, author_side: side, author_user_id: userId ?? null, body: checked.body, sticker: checked.sticker, created_at: at, reply_to: replyIn(chat.messages, thread, input?.reply_to), ...stored.columns }
    chat.messages.push(m)
    if (input?.silent === true) chat.silentSends.push(m.id)
    const peerUnread = side === 'client' ? 'staff_unread' : 'client_unread'
    Object.assign(thread, {
      last_message_at: at,
      last_author: side,
      last_preview: chatPreview(checked.body),
      [side === 'client' ? 'client_read_at' : 'staff_read_at']: at,
      [side === 'client' ? 'client_unread' : 'staff_unread']: 0,
      [peerUnread]: thread[peerUnread] + 1,
    })
    return { status: 200, json: { message: { ...chatView(m, side), reactions: [] } } }
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
          reaction: chatUnseenReaction('client', t),
        }
      })
      return { status: 200, json: { threads, attention: threads.filter((t) => t.unread).length } }
    }
    if (body.action === 'chat-thread') {
      const name = kind === 'trainer' ? names().get(String(row.trainer_id)) ?? '' : ''
      return { status: 200, json: { ...page(threadOf(clientId, kind), 'client', body.seen, chatReactorKey('client', clientId), body.before), kind, name } }
    }
    if (body.action === 'chat-send') return send(row, kind, 'client', null, body)
    if (body.action === 'chat-attach') return fileOf(chat.messages, threadOf(clientId, kind), body.message_id)
    if (body.action === 'chat-voice-audio' || body.action === 'chat-voice-text') {
      const want = body.action === 'chat-voice-text' ? 'text' : 'audio'
      return voiceOf(chat.messages, threadOf(clientId, kind), body.message_id, want, `c:${clientId}`, { side: 'client' })
    }
    if (body.action === 'chat-search') {
      const name = kind === 'trainer' ? names().get(String(row.trainer_id)) ?? '' : ''
      return search(chat.messages, threadOf(clientId, kind), body.q, (m) => buildChatMessageView(m, 'client', names()), name)
    }
    if (body.action === 'chat-react') {
      return react(threadOf(clientId, kind), chat.messages, body.message_id, chatReactorKey('client', clientId), body.emoji, chatAuthor)
    }
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
    const dmRole = staffDmRoleOf(viewer.role)
    const threadPeerIds = chat.dm.threads.map((t) => {
      const side = staffDmSideOf(t, viewer.id)
      return side ? (side === 'lo' ? t.user_hi : t.user_lo) : null
    })
    const clubName = (u) => state.clubs?.find((c) => c.id === u.club_id)?.name ?? ''
    const candidates = dmRole === 'admin' ? state.users.map((u) => ({ ...u, club_name: clubName(u) })) : state.users
    const names = linkedPersonNames(state.users)
    const asPerson = (p) => (names.has(String(p.id)) ? { ...p, name: names.get(String(p.id)), linked_trainer: true } : p)
    const staff =
      dmRole && (dmRole === 'admin' || viewer.club_id)
        ? buildStaffContacts({
            viewerId: viewer.id,
            peers: pickStaffDmPeers(viewer, candidates, threadPeerIds.filter(Boolean))
              .filter((p) => !hidden.has(String(p.id)))
              .map(asPerson),
            liveUserIds: state.live_user_ids ?? [],
            threads: chat.dm.threads,
          })
        : null
    const complaints = complaintThreads(user)
    const clientNames = new Map(state.clients.map((c) => [c.id, c]))
    const groups = group.summaries(viewer)
    const own = dmRole === 'admin' ? null : groups[0] ?? null
    const colleagues = staff ? folderOf(CHAT_FOLDER_COLLEAGUES, viewerRole, staff.colleagues) : null
    const folders = [
      clientsFolder(viewerRole, user),
      colleagues && own ? { ...colleagues, group: own, unread: colleagues.unread + staffGroupAttention(own) } : colleagues,
      staff ? folderOf(CHAT_FOLDER_ADMIN, viewerRole, staff.admin) : null,
      complaints ? folderOf(CHAT_FOLDER_COMPLAINTS, viewerRole, buildThreadContacts(complaints, clientNames)) : null,
    ].filter(Boolean)
    return { status: 200, json: { role: viewerRole, folders, groups } }
  }

  const dmViewer = (user) => ({ id: String(user?.id ?? ''), role: user?.role, club_id: user?.club_id })
  const dmPeer = (id) => state.users.find((u) => u.id === id) ?? null
  const dmThreadOf = (a, b) => {
    const pair = staffDmPair(a, b)
    return chat.dm.threads.find((t) => t.user_lo === pair.user_lo && t.user_hi === pair.user_hi)
  }

  /** Как staffDmHandler.sendStaffDmThread. */
  function dmThread(authUser, peerId, seen) {
    const viewer = dmViewer(dmUser(authUser))
    const peer = dmPeer(peerId)
    if (!peer) return { status: 404, json: { error: 'Сотрудник не найден' } }
    const thread = dmThreadOf(viewer.id, peer.id)
    if (!canReadStaffDm(viewer, peer, Boolean(thread))) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
    const person = linkedPersonNames(state.users).get(String(peer.id))
    const meta = {
      peer: { id: peer.id, name: person ?? peer.name, label: person ? LINKED_ROLE_LABEL_RU : staffRoleLabelRu(peer.role) },
      can_write: staffDmWriteAccess(viewer, peer).ok,
      voice_ready: chat.voiceReady,
    }
    if (!thread) return { status: 200, json: { ...meta, messages: [], has_more: false, marked_read: false, peer_read_at: null } }
    const view = staffDmThreadForViewer(thread, viewer.id)
    const marked = chatSeenFromRequest(seen) && isChatUnreadFor('staff', view)
    if (marked) {
      const side = staffDmSideOf(thread, viewer.id)
      Object.assign(thread, { [`${side}_read_at`]: new Date().toISOString(), [`${side}_unread`]: 0 })
    }
    if (chatSeenFromRequest(seen) && chatUnseenReaction('staff', view)) thread[`${staffDmSideOf(thread, viewer.id)}_reaction_seen_at`] = new Date().toISOString()
    const reactions = chatReactionsByMessage(chat.reactions, chatReactorKey('staff', viewer.id), reactorNames())
    const messages = chat.dm.messages
      .filter((m) => m.thread_id === thread.id)
      .map((m) => ({ ...dmView(m, viewer.id, peer.name), reactions: reactions.get(m.id) ?? [] }))
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
    if (!checked.ok) return { status: checked.status ?? 400, json: { error: checked.error } }
    const stored = storeVoice(checked)
    if (!stored.ok) return { status: stored.status, json: { error: stored.error } }
    let thread = dmThreadOf(viewer.id, peer.id)
    if (!thread) {
      thread = { id: `dm-${chat.dm.threads.length + 1}`, ...staffDmPair(viewer.id, peer.id), lo_unread: 0, hi_unread: 0 }
      chat.dm.threads.push(thread)
    }
    const at = new Date(Date.now() + chat.dm.messages.length).toISOString()
    const m = { id: `dmm-${chat.dm.messages.length + 1}`, thread_id: thread.id, author_user_id: viewer.id, body: checked.body, sticker: checked.sticker, created_at: at, reply_to: replyIn(chat.dm.messages, thread, input?.reply_to), ...stored.columns }
    chat.dm.messages.push(m)
    if (input?.silent === true) chat.silentSends.push(m.id)
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
    chat.dm.pushes.push({ to: peer.id, ...buildStaffDmPushPayload({ authorId: viewer.id, authorName: linkedPersonNames(state.users).get(String(user.id)) ?? user.name, body: checked.body }) })
    return { status: 200, json: { message: { ...dmView(m, viewer.id, peer.name), reactions: [] } } }
  }

  const dmAttention = (authUser) => {
    const user = dmUser(authUser)
    return chat.dm.threads.filter((t) => staffDmSideOf(t, user.id) && isChatUnreadFor('staff', staffDmThreadForViewer(t, user.id))).length
  }

  function staff(req, user) {
    if (req.searchParams.get('action') !== 'chat') return null
    const ctx = staffCtx(user)
    const inGroup = group.handle(req, dmUser(user))
    if (inGroup) return inGroup
    if (req.method === 'POST' && ['dm-voice-audio', 'dm-voice-text', 'dm-attach'].includes(req.body?.op)) {
      const viewer = dmViewer(dmUser(user))
      const peer = dmPeer(req.body.user_id)
      if (!peer) return { status: 404, json: { error: 'Сотрудник не найден' } }
      const thread = dmThreadOf(viewer.id, peer.id)
      if (!canReadStaffDm(viewer, peer, Boolean(thread))) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
      if (req.body.op === 'dm-attach') return fileOf(chat.dm.messages, thread, req.body.message_id)
      return voiceOf(chat.dm.messages, thread, req.body.message_id, req.body.op === 'dm-voice-text' ? 'text' : 'audio', `u:${viewer.id}`, { userId: viewer.id })
    }
    if (req.method === 'POST' && req.body?.op === 'dm-send') return dmSend(user, req.body.user_id, req.body)
    if (req.method === 'POST' && req.body?.op === 'dm-react') {
      const viewer = dmViewer(dmUser(user))
      const peer = dmPeer(req.body.user_id)
      const access = staffDmWriteAccess(viewer, peer)
      if (!access.ok) return { status: access.status, json: { error: access.error } }
      const thread = dmThreadOf(viewer.id, peer.id)
      return react(thread, chat.dm.messages, req.body.message_id, chatReactorKey('staff', viewer.id), req.body.emoji, dmAuthor)
    }
    if (req.searchParams.get('view') === 'dm-thread') return dmThread(user, req.searchParams.get('user_id'), req.searchParams.get('seen') ?? undefined)
    if (req.searchParams.get('view') === 'dm-search') {
      const viewer = dmViewer(dmUser(user))
      const peer = dmPeer(req.searchParams.get('user_id'))
      if (!peer) return { status: 404, json: { error: 'Сотрудник не найден' } }
      const thread = dmThreadOf(viewer.id, peer.id)
      if (!canReadStaffDm(viewer, peer, Boolean(thread))) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
      return search(chat.dm.messages, thread, req.searchParams.get('q'), (m) => buildStaffDmMessageView(m, viewer.id), peer.name)
    }
    if (req.method === 'POST') {
      const row = find(req.body?.client_id)
      const actor = actorFor(user, req.body?.kind)
      const voiceWant = { 'voice-audio': 'audio', 'voice-text': 'text', attach: 'file' }[req.body?.op] ?? null
      if (voiceWant) {
        if (!canStaffReadChat(staffCtx(actor), req.body.kind, row)) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
        if (voiceWant === 'file') return fileOf(chat.messages, threadOf(row.id, req.body.kind), req.body.message_id)
        return voiceOf(chat.messages, threadOf(row.id, req.body.kind), req.body.message_id, voiceWant, `u:${user.id}`, {
          side: 'staff',
          mark: !ctx.isAdmin,
        })
      }
      if (!canStaffWriteChat(staffCtx(actor), req.body?.kind, row)) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
      if (req.body?.op === 'react') {
        const reactor = chatReactorKey('staff', actor.id)
        return react(threadOf(row.id, req.body.kind), chat.messages, req.body.message_id, reactor, req.body.emoji, chatAuthor)
      }
      return send(row, req.body.kind, 'staff', actor.id, req.body)
    }
    if (req.searchParams.get('view') === 'contacts') return contacts(ctx, user)
    if ((req.searchParams.get('view') || 'list') === 'list') {
      const own = ctx.isAdmin ? [] : chat.threads.filter((t) => t.last_message_at && canStaffReadChat(ctx, t.kind, find(t.client_id)))
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
          reaction: chatUnseenReaction('staff', t),
        }))
      return { status: 200, json: { threads, attention: threads.filter((t) => t.unread).length + dmAttention(user) + group.attention(dmUser(user)) } }
    }
    const kind = req.searchParams.get('kind')
    const row = find(req.searchParams.get('client_id'))
    const actorCtx = staffCtx(actorFor(user, kind))
    if (!canStaffReadChat(actorCtx, kind, row)) return { status: 403, json: { error: CHAT_NO_ACCESS_RU } }
    if (req.searchParams.get('view') === 'search') {
      return search(chat.messages, threadOf(row.id, kind), req.searchParams.get('q'), (m) => buildChatMessageView(m, 'staff', names()), row.name)
    }
    return {
      status: 200,
      json: {
        client: { id: row.id, name: row.name, archived: false },
        kind,
        label: chatKindLabelRu(kind),
        can_write: canStaffWriteChat(actorCtx, kind, row),
        ...page(threadOf(row.id, kind), 'staff', req.searchParams.get('seen') ?? undefined, chatReactorKey('staff', actorFor(user, kind).id)),
      },
    }
  }

  return { state: chat, client, staff, attentionForClient }
}
