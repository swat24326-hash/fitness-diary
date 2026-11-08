/**
 * Группа АЗ: /api/coach и admin-data?action=chat (инструктор — только свой тред) и /api/client-me (подопечный).
 * GET  az-group-thread[&before][&seen=0] → { group, can_write, can_pin, muted, voice_ready, pinned, messages, has_more, marked_read, peer_read_at }
 * GET  az-group-search&q → { results }
 * GET  az-group-readers&message_id → azGroupPinHandler
 * POST az-group-send { body | sticker | (audio, sec, wave) | attach, reply_to?, client_msg_id?, silent? } → { message }
 * POST az-group-react { message_id, emoji|null } → { message_id, reactions }
 * POST az-group-voice-audio | az-group-voice-text | az-group-attach { message_id }
 * POST az-group-mute { muted } → { muted }
 * Клиент передаёт instructor_user_id. Текст сообщений в лог не пишем. Админ чужие треды не открывает.
 */
import { sendJson } from '../adminSupabase.js'
import {
  AZ_GROUP_NO_MEMBERS_RU,
  AZ_GROUP_TITLE_RU,
  AZ_GROUP_UNAVAILABLE_RU,
  azGroupMemberIds,
  azGroupParticipantKey,
  azGroupPeerReadAt,
  azGroupReadAt,
  buildAzGroupMessageView,
} from '../../../src/lib/chat/azGroupCore.js'
import { azGroupSeenCount, buildAzGroupPinned, canPinAzGroup } from '../../../src/lib/chat/azGroupPinCore.js'
import {
  CHAT_SEND_LIMIT_RU,
  CHAT_SEND_PER_MINUTE,
  chatSendWindowStart,
  isChatSendLimited,
  normalizeClientMsgId,
} from '../../../src/lib/chat/chatDeliveryCore.js'
import { CHAT_REACTION_GONE_RU } from '../../../src/lib/chat/chatReactionCore.js'
import { chatReplyQuoteFor } from '../../../src/lib/chat/chatReplyCore.js'
import { buildChatSearchHit, normalizeChatSearchQuery } from '../../../src/lib/chat/chatSearchCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { answerChatAttach, sendChatFileAnswer, storeChatOutgoing } from './chatAttachHandler.js'
import { loadReactionsFor, setMessageReaction } from './chatReactionStore.js'
import { loadReplyTarget, loadReplyTargets } from './chatReplyStore.js'
import { searchThreadMessages } from './chatSearchStore.js'
import { loadStaffNames } from './chatStore.js'
import { answerChatVoice, chatVoiceBlocked } from './chatVoiceHandler.js'
import { chatVoiceStorageMode } from './chatVoiceStorage.js'
import { sendAzGroupPush } from './azGroupPushJob.js'
import { clientAzScope, instructorAzScope, loadAzMembers, withAzTable } from './azGroupScope.js'
import {
  countRecentAzGroupMessages,
  ensureAzGroupThread,
  insertAzGroupMessage,
  loadAzGroupMessageByClientMsgId,
  loadAzGroupMessages,
  loadAzGroupPin,
  loadAzGroupRead,
  loadAzGroupReads,
  loadAzGroupThread,
  loadClientNames,
  saveAzGroupRead,
} from './azGroupStore.js'

const isIsoCursor = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))

const authorKeyOf = (m) =>
  m?.author_side === 'client'
    ? azGroupParticipantKey({ side: 'client', clientId: m.author_client_id })
    : azGroupParticipantKey({ side: 'user', userId: m.author_user_id })

const withName = (m, names) => (m ? { ...m, author_name: names.get(authorKeyOf(m)) || '' } : m)

const hasClients = (members) => members.some((m) => m.side === 'client')

function clientNameMap(members) {
  return new Map(members.filter((m) => m.side === 'client').map((m) => [m.id, m.name]))
}

async function namesFor(db, members, messages) {
  const map = new Map(members.map((m) => [azGroupParticipantKey({ side: m.side, userId: m.id, clientId: m.id }), m.name]))
  const userIds = []
  const clientIds = []
  for (const m of messages) {
    if (!m) continue
    if (m.author_side === 'client') clientIds.push(m.author_client_id)
    else userIds.push(m.author_user_id)
  }
  const [staff, clients] = await Promise.all([loadStaffNames(db, userIds.filter(Boolean)), loadClientNames(db, clientIds)])
  for (const [id, name] of staff) {
    const key = azGroupParticipantKey({ side: 'user', userId: id })
    if (name && !map.get(key)) map.set(key, name)
  }
  for (const [id, name] of clients) {
    const key = azGroupParticipantKey({ side: 'client', clientId: id })
    if (name && !map.get(key)) map.set(key, name)
  }
  return map
}

function groupMeta(scope, members, read) {
  return {
    group: {
      instructor_user_id: scope.instructorUserId,
      name: scope.instructorName ? `${AZ_GROUP_TITLE_RU} · ${scope.instructorName}` : AZ_GROUP_TITLE_RU,
      members: members.length,
    },
    can_write: hasClients(members),
    can_pin: canPinAzGroup(scope.viewer, scope.instructorUserId),
    muted: read?.muted === true,
    voice_ready: chatVoiceStorageMode() != null,
  }
}

async function readyThread(res, scope) {
  const existing = await loadAzGroupThread(scope.db, scope.instructorUserId)
  if (existing) return existing
  if (!isInboxUuid(scope.clubId)) {
    sendJson(res, 503, { error: AZ_GROUP_UNAVAILABLE_RU })
    return null
  }
  return ensureAzGroupThread(scope.db, scope.instructorUserId, scope.clubId)
}

async function openThread(res, scope, before, seen) {
  const members = await loadAzMembers(scope.db, scope)
  const thread = await loadAzGroupThread(scope.db, scope.instructorUserId)
  const read = thread ? await loadAzGroupRead(scope.db, thread.id, scope.viewerKey) : null
  const meta = groupMeta(scope, members, read)
  if (!thread) {
    sendJson(res, 200, { ...meta, pinned: null, messages: [], has_more: false, marked_read: false, peer_read_at: null })
    return
  }
  const page = await loadAzGroupMessages(scope.db, thread.id, isIsoCursor(before) ? before : null)
  const readAt = !before && chatSeenFromRequest(seen) ? azGroupReadAt(read, page.messages.at(-1)?.created_at) : null
  if (readAt) await saveAzGroupRead(scope.db, thread.id, scope.viewerKey, { read_at: readAt })
  const [reactions, quoted, reads, pin] = await Promise.all([
    loadReactionsFor(scope.db, 'az', page.messages.map((m) => m.id), scope.viewerKey, clientNameMap(members)),
    loadReplyTargets(scope.db, 'az', thread.id, page.messages),
    loadAzGroupReads(scope.db, thread.id),
    loadAzGroupPin(scope.db, thread.id),
  ])
  const names = await namesFor(scope.db, members, [...page.messages, ...quoted.values(), ...(pin?.message ? [pin.message] : [])])
  const toView = (m) => buildAzGroupMessageView(withName(m, names), scope.viewer)
  const seenOf = (m, view) => (view.mine ? { seen: azGroupSeenCount(m, members, reads) } : {})
  sendJson(res, 200, {
    ...meta,
    pinned: pin?.message ? buildAzGroupPinned(toView(pin.message), pin.pinned_at) : null,
    messages: page.messages.map((m) => {
      const view = toView(m)
      return { ...view, ...seenOf(m, view), reply: chatReplyQuoteFor(m, quoted, toView, ''), reactions: reactions.get(String(m.id)) ?? [] }
    }),
    has_more: page.has_more,
    marked_read: Boolean(readAt),
    peer_read_at: azGroupPeerReadAt(reads, scope.viewerKey, azGroupMemberIds(members)),
  })
}

async function sendMessage(res, scope, input) {
  const members = await loadAzMembers(scope.db, scope)
  if (!hasClients(members)) {
    sendJson(res, 403, { error: AZ_GROUP_NO_MEMBERS_RU })
    return
  }
  const checked = resolveChatOutgoing({
    body: input?.body,
    sticker: input?.sticker,
    parts: input?.parts,
    audio: input?.audio,
    trim: input?.trim,
    sec: input?.sec,
    wave: input?.wave,
    once: false,
    attach: input?.attach,
  })
  const refused = checked.ok ? chatVoiceBlocked(checked) : checked
  if (refused) {
    sendJson(res, refused.status ?? 400, { error: refused.error })
    return
  }
  const thread = await readyThread(res, scope)
  if (!thread) return
  const clientMsgId = normalizeClientMsgId(input?.client_msg_id)
  const earlier = await loadAzGroupMessageByClientMsgId(scope.db, thread.id, clientMsgId)
  let stored = { voice: null, attach: null }
  if (!earlier) {
    const recent = await countRecentAzGroupMessages(scope.db, thread.id, scope.viewer, chatSendWindowStart(), CHAT_SEND_PER_MINUTE)
    if (isChatSendLimited(recent)) {
      sendJson(res, 429, { error: CHAT_SEND_LIMIT_RU })
      return
    }
    const authorId = scope.viewer.kind === 'client' ? scope.viewer.clientId : scope.viewer.userId
    const put = await storeChatOutgoing(checked, { side: scope.viewer.kind === 'client' ? 'client' : 'staff', authorId, msgId: clientMsgId })
    if (!put.ok) {
      sendJson(res, put.status, { error: put.error })
      return
    }
    stored = put
  }
  const target = earlier ? null : await loadReplyTarget(scope.db, 'az', thread.id, input?.reply_to)
  const { message, duplicate } = earlier
    ? { message: earlier, duplicate: true }
    : await insertAzGroupMessage(scope.db, thread, {
        viewer: scope.viewer,
        body: checked.body,
        sticker: checked.sticker,
        clientMsgId,
        replyTo: target?.id ?? null,
        voice: stored.voice,
        attach: stored.attach,
      })
  const quoted = await loadReplyTargets(scope.db, 'az', thread.id, [message])
  const names = await namesFor(scope.db, members, [message, ...quoted.values()])
  const toView = (m) => buildAzGroupMessageView(withName(m, names), scope.viewer)
  const reads = await loadAzGroupReads(scope.db, thread.id)
  if (!duplicate) {
    const authorName = names.get(scope.viewerKey) || (scope.viewer.kind === 'client' ? 'Клиент' : scope.instructorName || 'Инструктор')
    sendAzGroupPush(scope.db, {
      instructorUserId: scope.instructorUserId,
      instructorName: scope.instructorName,
      memberKeys: azGroupMemberIds(members),
      mutedKeys: reads.filter((r) => r.muted).map((r) => r.participant),
      authorKey: scope.viewerKey,
      authorName,
      body: checked.body,
      silent: input?.silent === true,
    }).catch((e) => console.warn('[az-group-push]', e?.message || e))
  }
  sendJson(res, 200, {
    message: { ...toView(message), seen: azGroupSeenCount(message, members, reads), reply: chatReplyQuoteFor(message, quoted, toView, ''), reactions: [] },
  })
}

async function search(res, scope, q) {
  const checked = normalizeChatSearchQuery(q)
  if (!checked.ok) {
    sendJson(res, 400, { error: checked.error })
    return
  }
  const thread = await loadAzGroupThread(scope.db, scope.instructorUserId)
  const found = thread ? await searchThreadMessages(scope.db, 'az', thread.id, checked.q) : []
  const members = await loadAzMembers(scope.db, scope)
  const names = await namesFor(scope.db, members, found)
  const toView = (m) => buildAzGroupMessageView(withName(m, names), scope.viewer)
  sendJson(res, 200, { results: found.map((m) => buildChatSearchHit(toView(m), checked.q, '')) })
}

async function voice(res, scope, messageId, want) {
  const thread = await loadAzGroupThread(scope.db, scope.instructorUserId)
  const threadId = thread?.id ?? null
  const out =
    want === 'file'
      ? await answerChatAttach(scope.db, 'az_group_messages', threadId, messageId)
      : await answerChatVoice(scope.db, 'az_group_messages', threadId, messageId, want, scope.viewerKey, { participant: scope.viewerKey })
  sendChatFileAnswer(res, out)
}

async function react(res, scope, input) {
  const thread = await loadAzGroupThread(scope.db, scope.instructorUserId)
  const members = thread ? await loadAzMembers(scope.db, scope) : []
  const out = thread
    ? await setMessageReaction(scope.db, 'az', {
        threadId: thread.id,
        messageId: input?.message_id,
        reactor: scope.viewerKey,
        emoji: input?.emoji,
        clientNames: clientNameMap(members),
      })
    : { status: 404, body: { error: CHAT_REACTION_GONE_RU } }
  sendJson(res, out.status, out.body)
}

async function mute(res, scope, muted) {
  const thread = await readyThread(res, scope)
  if (!thread) return
  await saveAzGroupRead(scope.db, thread.id, scope.viewerKey, { muted: muted === true })
  sendJson(res, 200, { muted: muted === true })
}

function forInstructor(authCtx, res, requestedId, fn) {
  return withAzTable(res, async () => {
    const scope = await instructorAzScope(authCtx, res, requestedId)
    if (scope) await fn(scope)
  })
}

function forClient(db, client, res, instructorId, fn) {
  return withAzTable(res, async () => {
    const scope = await clientAzScope(db, client, res, instructorId)
    if (scope) await fn(scope)
  })
}

export function sendAzGroupThread(authCtx, res, before, seen, requestedId) {
  return forInstructor(authCtx, res, requestedId, (scope) => openThread(res, scope, before, seen))
}

export function sendAzGroupMessage(authCtx, res, input, requestedId) {
  return forInstructor(authCtx, res, requestedId, (scope) => sendMessage(res, scope, input))
}

export function sendAzGroupSearch(authCtx, res, q, requestedId) {
  return forInstructor(authCtx, res, requestedId, (scope) => search(res, scope, q))
}

/** @param {'audio'|'text'|'file'} want */
export function sendAzGroupVoice(authCtx, res, messageId, want, requestedId) {
  return forInstructor(authCtx, res, requestedId, (scope) => voice(res, scope, messageId, want))
}

export function reactAzGroupMessage(authCtx, res, input, requestedId) {
  return forInstructor(authCtx, res, requestedId, (scope) => react(res, scope, input))
}

export function muteAzGroup(authCtx, res, muted, requestedId) {
  return forInstructor(authCtx, res, requestedId, (scope) => mute(res, scope, muted))
}

export function sendClientAzGroupThread(db, client, res, instructorId, before, seen) {
  return forClient(db, client, res, instructorId, (scope) => openThread(res, scope, before, seen))
}

export function sendClientAzGroupMessage(db, client, res, instructorId, input) {
  return forClient(db, client, res, instructorId, (scope) => sendMessage(res, scope, input))
}

export function sendClientAzGroupSearch(db, client, res, instructorId, q) {
  return forClient(db, client, res, instructorId, (scope) => search(res, scope, q))
}

export function sendClientAzGroupVoice(db, client, res, instructorId, messageId, want) {
  return forClient(db, client, res, instructorId, (scope) => voice(res, scope, messageId, want))
}

export function reactClientAzGroupMessage(db, client, res, instructorId, input) {
  return forClient(db, client, res, instructorId, (scope) => react(res, scope, input))
}

export function muteClientAzGroup(db, client, res, instructorId, muted) {
  return forClient(db, client, res, instructorId, (scope) => mute(res, scope, muted))
}

