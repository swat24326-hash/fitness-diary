/**
 * Открыть диалог и отправить сообщение — общее для клиента и сотрудника.
 * Доступ уже проверен вызывающим handler; здесь только лента, отметка «прочитано» и push.
 */
import { chatPeerReadAt, isChatUnreadFor } from '../../../src/lib/chat/chatAccessCore.js'
import {
  CHAT_SEND_LIMIT_RU,
  CHAT_SEND_PER_MINUTE,
  chatSendWindowStart,
  isChatSendLimited,
  normalizeClientMsgId,
} from '../../../src/lib/chat/chatDeliveryCore.js'
import { buildChatMessageView } from '../../../src/lib/chat/chatMessageCore.js'
import { CHAT_REACTION_GONE_RU, chatUnseenReaction } from '../../../src/lib/chat/chatReactionCore.js'
import { chatReplyQuoteFor } from '../../../src/lib/chat/chatReplyCore.js'
import { buildChatSearchHit, normalizeChatSearchQuery } from '../../../src/lib/chat/chatSearchCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import { sendChatPush } from './chatPushJob.js'
import { loadReactionsFor, markReactionSeen, setMessageReaction } from './chatReactionStore.js'
import { loadReplyTarget, loadReplyTargets } from './chatReplyStore.js'
import { searchThreadMessages } from './chatSearchStore.js'
import { answerChatAttach, storeChatOutgoing } from './chatAttachHandler.js'
import { answerChatVoice, chatVoiceBlocked } from './chatVoiceHandler.js'
import { chatVoiceStorageMode } from './chatVoiceStorage.js'
import {
  countRecentChatMessages,
  ensureChatThread,
  insertChatMessage,
  loadChatMessageByClientMsgId,
  loadChatMessages,
  loadChatThread,
  loadStaffNames,
  markChatRead,
} from './chatStore.js'

function isIsoCursor(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

/**
 * @param {'client'|'staff'} side
 * markRead=false — смотрит не ответственный (главный админ): непрочитанное остаётся у того, кто отвечает.
 */
export async function openChatThread(db, { client, kind, side, reactor, before, markRead = true }) {
  const thread = await loadChatThread(db, client.id, kind)
  const voice_ready = chatVoiceStorageMode() != null
  if (!thread) return { messages: [], has_more: false, marked_read: false, peer_read_at: null, voice_ready }
  const page = await loadChatMessages(db, thread.id, isIsoCursor(before) ? before : null)
  const marked =
    markRead && !before && isChatUnreadFor(side, thread) && (await markChatRead(db, thread, side, page.messages.at(-1)?.created_at))
  const ids = page.messages.map((m) => m.id)
  const [quoted, reactions] = await Promise.all([
    loadReplyTargets(db, 'chat', thread.id, page.messages),
    loadReactionsFor(db, 'chat', ids, reactor, clientNameMap(client)),
  ])
  const names = await loadStaffNames(db, [...page.messages, ...quoted.values()].map((m) => m.author_user_id))
  if (markRead && !before && chatUnseenReaction(side, thread)) await markReactionSeen(db, 'chat', thread.id, `${side}_reaction_seen_at`)
  const toView = (m) => buildChatMessageView(m, side, names)
  return {
    messages: page.messages.map((m) => ({
      ...toView(m),
      reply: chatReplyQuoteFor(m, quoted, toView, peerNameOf(side, client)),
      reactions: reactions.get(String(m.id)) ?? [],
    })),
    has_more: page.has_more,
    marked_read: marked,
    peer_read_at: chatPeerReadAt(side, thread),
    voice_ready,
  }
}

/**
 * Поиск по диалогу: { results } новые сверху или 400 (короткий запрос). Диалога ещё нет — пусто.
 * @param {'client'|'staff'} side
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function searchChatThread(db, { client, kind, side, q }) {
  const checked = normalizeChatSearchQuery(q)
  if (!checked.ok) return { status: 400, body: { error: checked.error } }
  const thread = await loadChatThread(db, client.id, kind)
  if (!thread) return { status: 200, body: { results: [] } }
  const found = await searchThreadMessages(db, 'chat', thread.id, checked.q)
  const names = await loadStaffNames(db, found.map((m) => m.author_user_id))
  const results = found.map((m) => buildChatSearchHit(buildChatMessageView(m, side, names), checked.q, peerNameOf(side, client)))
  return { status: 200, body: { results } }
}

/** Своя реакция на сообщение диалога; reactor — chatReactorKey того, кто ставит. */
export async function reactChatMessage(db, { client, kind, reactor, messageId, emoji }) {
  const thread = await loadChatThread(db, client.id, kind)
  if (!thread) return { status: 404, body: { error: CHAT_REACTION_GONE_RU } }
  return setMessageReaction(db, 'chat', { threadId: thread.id, messageId, reactor, emoji, clientNames: clientNameMap(client) })
}

/**
 * Звук или расшифровка голосового, файл вложения из диалога клиента (доступ на чтение уже проверен).
 * @param {'audio'|'text'|'file'} want
 * @param {'client'|'staff'} side кто слушает; mark=false — смотрит не ответственный: «прослушано» не ставим
 */
export async function chatVoiceOf(db, { client, kind, messageId, want, who, side, mark = true }) {
  const thread = await loadChatThread(db, client.id, kind)
  if (want === 'file') return answerChatAttach(db, 'chat_messages', thread?.id ?? null, messageId)
  return answerChatVoice(db, 'chat_messages', thread?.id ?? null, messageId, want, who, { side, mark })
}

/** «Кто поставил» у реакции клиента — его имя. */
function clientNameMap(client) {
  return new Map([[String(client.id), String(client.name ?? '').trim()]])
}

/** Имя в цитате сообщения клиента у сотрудника (у сообщений сотрудников имя своё). */
function peerNameOf(side, client) {
  return side === 'staff' ? String(client.name ?? '').trim() : ''
}

/**
 * replyTo — id сообщения этого диалога, на которое отвечают (не из диалога — отправим без цитаты).
 * voice — { audio, sec, wave } голосового (chatVoiceCore); тогда body и sticker не нужны.
 * attach — { kind, data, name?, w?, h? } фото или PDF (chatAttachCore); body тогда — подпись. silent — push без звука.
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function sendChatMessage(db, { client, kind, side, userId, body, sticker, voice, attach, clientMsgId, replyTo, silent = false }) {
  const checked = resolveChatOutgoing({ body, sticker, ...voice, attach })
  if (!checked.ok) return { status: checked.status ?? 400, body: { error: checked.error } }
  const blocked = chatVoiceBlocked(checked)
  if (blocked) return { status: blocked.status, body: { error: blocked.error } }
  const thread = await ensureChatThread(db, client, kind)
  const msgId = normalizeClientMsgId(clientMsgId)
  const earlier = await loadChatMessageByClientMsgId(db, thread.id, msgId)
  let stored = { voice: null, attach: null }
  if (!earlier) {
    const recent = await countRecentChatMessages(db, thread.id, { side, userId }, chatSendWindowStart(), CHAT_SEND_PER_MINUTE)
    if (isChatSendLimited(recent)) return { status: 429, body: { error: CHAT_SEND_LIMIT_RU } }
    const put = await storeChatOutgoing(checked, { side, authorId: side === 'client' ? client.id : userId, msgId })
    if (!put.ok) return { status: put.status, body: { error: put.error } }
    stored = put
  }
  const target = earlier ? null : await loadReplyTarget(db, 'chat', thread.id, replyTo)
  const { message, duplicate } = earlier
    ? { message: earlier, duplicate: true }
    : await insertChatMessage(db, thread, client, {
        side,
        userId,
        body: checked.body,
        sticker: checked.sticker,
        clientMsgId: msgId,
        replyTo: target?.id ?? null,
        voice: stored.voice,
        attach: stored.attach,
      })
  const quoted = await loadReplyTargets(db, 'chat', thread.id, [message])
  const names = await loadStaffNames(db, [message.author_user_id ?? (side === 'staff' ? userId : null), ...[...quoted.values()].map((m) => m.author_user_id)])
  const toView = (m) => buildChatMessageView(m, side, names)
  const view = { ...toView(message), reply: chatReplyQuoteFor(message, quoted, toView, peerNameOf(side, client)), reactions: [] }
  if (duplicate) return { status: 200, body: { message: view } }
  const push = { kind, authorSide: side, client, authorUserId: userId, authorName: view.author_name, body: checked.body, silent: silent === true }
  sendChatPush(db, push).catch((e) =>
    console.warn('[chat-push]', e?.message || e),
  )
  return { status: 200, body: { message: view } }
}
