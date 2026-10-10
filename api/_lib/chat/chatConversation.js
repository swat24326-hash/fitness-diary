/**
 * Открыть диалог и отправить сообщение — общее для клиента и сотрудника.
 * Доступ уже проверен вызывающим handler; здесь только лента, отметка «прочитано» и push.
 */
import { chatPeerReadAt, isChatUnreadFor } from '../../../src/lib/chat/chatAccessCore.js'
import { buildChatMessageView } from '../../../src/lib/chat/chatMessageCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import { sendChatPush } from './chatPushJob.js'
import {
  ensureChatThread,
  insertChatMessage,
  loadChatMessages,
  loadChatThread,
  loadStaffNames,
  markChatRead,
} from './chatStore.js'

function isIsoCursor(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

/** @param {'client'|'staff'} side */
export async function openChatThread(db, { client, kind, side, before }) {
  const thread = await loadChatThread(db, client.id, kind)
  if (!thread) return { messages: [], has_more: false, marked_read: false, peer_read_at: null }
  const page = await loadChatMessages(db, thread.id, isIsoCursor(before) ? before : null)
  const marked = !before && isChatUnreadFor(side, thread)
  if (marked) await markChatRead(db, thread, side)
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
export async function sendChatMessage(db, { client, kind, side, userId, body, sticker }) {
  const checked = resolveChatOutgoing({ body, sticker })
  if (!checked.ok) return { status: 400, body: { error: checked.error } }
  const thread = await ensureChatThread(db, client, kind)
  const { message } = await insertChatMessage(db, thread, client, { side, userId, body: checked.body, sticker: checked.sticker })
  const names = side === 'staff' ? await loadStaffNames(db, [userId]) : new Map()
  const view = buildChatMessageView(message, side, names)
  sendChatPush(db, { kind, authorSide: side, client, authorUserId: userId, authorName: view.author_name, body: checked.body }).catch((e) =>
    console.warn('[chat-push]', e?.message || e),
  )
  return { status: 200, body: { message: view } }
}
