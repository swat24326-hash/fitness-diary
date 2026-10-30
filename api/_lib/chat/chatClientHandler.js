/**
 * Переписка клиента через /api/client-me (токен клиента, только свои диалоги).
 * POST { action: 'chat-list' } | { action: 'chat-thread', kind, peer_user_id?, before?, seen? }
 *      | { action: 'chat-send', kind, peer_user_id?, body | sticker | … }
 *      | { action: 'chat-react' | 'chat-search' | 'chat-voice-*' | 'chat-attach', kind, peer_user_id?, … }
 * Видеокружок — бинарный POST ?op=chat-send&kind&peer_user_id&sec (chatVideoHandler.js).
 */
import { sendJson } from '../adminSupabase.js'
import {
  CHAT_KIND_AZ_INSTRUCTOR,
  chatKindLabelRu,
  chatUnreadCount,
  clientChatAttention,
  clientChatKinds,
  isChatUnreadFor,
} from '../../../src/lib/chat/chatAccessCore.js'
import {
  buildClientChatDialogs,
  clientAzInstructorPeerIds,
  clientMayChatAzInstructor,
  isAzInstructorChatKind,
} from '../../../src/lib/chat/clientAzChatCore.js'
import { chatReactorKey, chatUnseenReaction } from '../../../src/lib/chat/chatReactionCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { sendChatFileAnswer } from './chatAttachHandler.js'
import { chatVoiceOf, openChatThread, reactChatMessage, searchChatThread, sendChatMessage } from './chatConversation.js'
import { rows } from '../inbox/inboxStore.js'
import { isMissingChatTable, loadClientAzInstructorRows, loadClientThreads, loadStaffCards } from './chatStore.js'

const UNAVAILABLE_RU = 'Сообщения пока недоступны — попробуйте позже'

function threadByDialogKey(threads) {
  const map = new Map()
  for (const t of threads ?? []) {
    const kind = String(t.kind ?? '')
    const peer = String(t.peer_user_id ?? '').trim()
    map.set(peer ? `${kind}:${peer}` : kind, t)
  }
  return map
}

async function loadDirectionNames(db, directionIds) {
  const ids = [...new Set((directionIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (!ids.length) return new Map()
  try {
    const types = await rows(db.from('membership_types').select('id, name').in('id', ids))
    return new Map(types.map((t) => [String(t.id), String(t.name ?? '').trim()]))
  } catch {
    return new Map()
  }
}

async function listThreads(db, client) {
  const [stored, azRows] = await Promise.all([loadClientThreads(db, client.id), loadClientAzInstructorRows(db, client.id)])
  const peerIds = clientAzInstructorPeerIds(azRows)
  const staffIds = [...new Set([String(client.trainer_id ?? '').trim(), ...peerIds].filter(Boolean))]
  const [cards, dirNames] = await Promise.all([
    loadStaffCards(db, staffIds),
    loadDirectionNames(
      db,
      azRows.map((r) => r.direction_type_id),
    ),
  ])
  const nameById = Object.fromEntries([...cards].map(([id, c]) => [id, c.name]))
  const dialogs = buildClientChatDialogs({
    client,
    azInstructors: azRows,
    instructorNameById: nameById,
    directionNameById: Object.fromEntries(dirNames),
  })
  const byKey = threadByDialogKey(stored)
  const threads = dialogs.map((d) => {
    const key = d.peer_user_id ? `${d.kind}:${d.peer_user_id}` : d.kind
    const t = byKey.get(key)
    const card = d.peer_user_id
      ? cards.get(String(d.peer_user_id))
      : d.kind === 'trainer'
        ? cards.get(String(client.trainer_id ?? ''))
        : null
    return {
      kind: d.kind,
      peer_user_id: d.peer_user_id,
      label: d.title || chatKindLabelRu(d.kind),
      title: d.title || '',
      name: d.name || card?.name || '',
      photo: card?.photo ?? null,
      status: card?.status ?? null,
      last_preview: t?.last_preview ?? '',
      last_message_at: t?.last_message_at ?? null,
      last_author: t?.last_author ?? null,
      unread: isChatUnreadFor('client', t),
      unread_count: chatUnreadCount('client', t),
      reaction: chatUnseenReaction('client', t),
    }
  })
  return { threads, attention: threads.filter((t) => t.unread).length }
}

function peerFromBody(body) {
  return String(body?.peer_user_id ?? '').trim() || null
}

/** Доступ к виду диалога; для АЗ — peer обязан быть назначен. */
async function assertClientChatAccess(db, client, kind, peerUserId, res) {
  if (isAzInstructorChatKind(kind)) {
    const peer = String(peerUserId ?? '').trim()
    if (!peer) {
      sendJson(res, 404, { error: 'Диалог не найден' })
      return false
    }
    const azRows = await loadClientAzInstructorRows(db, client.id)
    if (!clientMayChatAzInstructor(azRows, peer)) {
      sendJson(res, 404, { error: 'Инструктор не назначен' })
      return false
    }
    return true
  }
  if (!clientChatKinds(client).includes(kind)) {
    sendJson(res, 404, { error: kind === 'trainer' ? 'Тренер пока не назначен' : 'Диалог не найден' })
    return false
  }
  return true
}

/** Число непрочитанных диалогов для конверта (GET /api/client-me) — только те, что видны в списке. До миграции — 0. */
export async function loadClientChatAttention(db, client) {
  try {
    const [threads, azRows] = await Promise.all([loadClientThreads(db, client.id), loadClientAzInstructorRows(db, client.id)])
    return clientChatAttention(client, threads, clientAzInstructorPeerIds(azRows))
  } catch (e) {
    if (isMissingChatTable(e)) return 0
    throw e
  }
}

export async function handleClientChatPost(db, ctx, body, res) {
  const client = ctx.client
  const kind = String(body?.kind ?? '')
  const peerUserId = peerFromBody(body)
  try {
    if (body.action === 'chat-list') {
      sendJson(res, 200, await listThreads(db, client))
      return
    }
    if (!(await assertClientChatAccess(db, client, kind, peerUserId, res))) return
    const peer = isAzInstructorChatKind(kind) ? peerUserId : null
    if (body.action === 'chat-thread') {
      const staffId = peer || (kind === 'trainer' ? client.trainer_id : null)
      const [page, cards] = await Promise.all([
        openChatThread(db, {
          client,
          kind,
          peerUserId: peer,
          side: 'client',
          reactor: chatReactorKey('client', client.id),
          before: body.before,
          markRead: chatSeenFromRequest(body.seen),
        }),
        staffId ? loadStaffCards(db, [staffId]) : new Map(),
      ])
      const card = cards.get(String(staffId ?? ''))
      sendJson(res, 200, {
        ...page,
        kind,
        peer_user_id: peer,
        name: card?.name ?? '',
        photo: card?.photo ?? null,
        status: card?.status ?? null,
        label: peer ? chatKindLabelRu(CHAT_KIND_AZ_INSTRUCTOR) : chatKindLabelRu(kind),
      })
      return
    }
    if (body.action === 'chat-send') {
      const out = await sendChatMessage(db, {
        client,
        kind,
        peerUserId: peer,
        side: 'client',
        body: body.body,
        sticker: body.sticker,
        voice: { parts: body.parts, audio: body.audio, trim: body.trim, sec: body.sec, wave: body.wave, once: body.once },
        attach: body.attach,
        clientMsgId: body.client_msg_id,
        replyTo: body.reply_to,
        silent: body.silent === true,
      })
      sendJson(res, out.status, out.body)
      return
    }
    if (body.action === 'chat-voice-audio' || body.action === 'chat-voice-text' || body.action === 'chat-attach') {
      const want = body.action === 'chat-voice-text' ? 'text' : body.action === 'chat-attach' ? 'file' : 'audio'
      const out = await chatVoiceOf(db, {
        client,
        kind,
        peerUserId: peer,
        messageId: body.message_id,
        want,
        who: `c:${client.id}`,
        side: 'client',
      })
      sendChatFileAnswer(res, out)
      return
    }
    if (body.action === 'chat-search') {
      const out = await searchChatThread(db, { client, kind, peerUserId: peer, side: 'client', q: body.q })
      sendJson(res, out.status, out.body)
      return
    }
    if (body.action === 'chat-react') {
      const reactor = chatReactorKey('client', client.id)
      const out = await reactChatMessage(db, {
        client,
        kind,
        peerUserId: peer,
        reactor,
        messageId: body.message_id,
        emoji: body.emoji,
      })
      sendJson(res, out.status, out.body)
      return
    }
    sendJson(res, 400, { error: 'Неизвестное действие' })
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}
