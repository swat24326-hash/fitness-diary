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
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import { sendChatPush } from './chatPushJob.js'
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
export async function openChatThread(db, { client, kind, side, before, markRead = true }) {
  const thread = await loadChatThread(db, client.id, kind)
  if (!thread) return { messages: [], has_more: false, marked_read: false, peer_read_at: null }
  const page = await loadChatMessages(db, thread.id, isIsoCursor(before) ? before : null)
  const marked =
    markRead && !before && isChatUnreadFor(side, thread) && (await markChatRead(db, thread, side, page.messages.at(-1)?.created_at))
  const names = await loadStaffNames(db, page.messages.map((m) => m.author_user_id))
  return {
    messages: page.messages.map((m) => buildChatMessageView(m, side, names)),
    has_more: page.has_more,
    marked_read: marked,
    peer_read_at: chatPeerReadAt(side, thread),
  }
}

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function sendChatMessage(db, { client, kind, side, userId, body, sticker, clientMsgId }) {
  const checked = resolveChatOutgoing({ body, sticker })
  if (!checked.ok) return { status: 400, body: { error: checked.error } }
  const thread = await ensureChatThread(db, client, kind)
  const msgId = normalizeClientMsgId(clientMsgId)
  const earlier = await loadChatMessageByClientMsgId(db, thread.id, msgId)
  if (!earlier) {
    const recent = await countRecentChatMessages(db, thread.id, { side, userId }, chatSendWindowStart(), CHAT_SEND_PER_MINUTE)
    if (isChatSendLimited(recent)) return { status: 429, body: { error: CHAT_SEND_LIMIT_RU } }
  }
  const { message, duplicate } = earlier
    ? { message: earlier, duplicate: true }
    : await insertChatMessage(db, thread, client, { side, userId, body: checked.body, sticker: checked.sticker, clientMsgId: msgId })
  const names = side === 'staff' ? await loadStaffNames(db, [message.author_user_id ?? userId]) : new Map()
  const view = buildChatMessageView(message, side, names)
  if (duplicate) return { status: 200, body: { message: view } }
  sendChatPush(db, { kind, authorSide: side, client, authorUserId: userId, authorName: view.author_name, body: checked.body }).catch((e) =>
    console.warn('[chat-push]', e?.message || e),
  )
  return { status: 200, body: { message: view } }
}
