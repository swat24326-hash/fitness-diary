/**
 * Переписка клиента через /api/client-me (токен клиента, только свои диалоги).
 * POST { action: 'chat-list' } | { action: 'chat-thread', kind, before?, seen? } (отмечает прочитанным; seen=0 — нет)
 *      | { action: 'chat-send', kind, body | sticker | (audio, sec, wave), reply_to? } — audio — голосовое (base64 MP3)
 *      | { action: 'chat-react', kind, message_id, emoji|null } → { message_id, reactions }
 *      | { action: 'chat-search', kind, q } → { results } — поиск по своему диалогу
 *      | { action: 'chat-voice-audio', kind, message_id } → { audio, mime } — звук голосового (сутки, потом 410)
 *      | { action: 'chat-voice-text', kind, message_id } → { done, text? } — расшифровка «→ Аа» (chatVoiceHandler.js)
 */
import { sendJson } from '../adminSupabase.js'
import { chatKindLabelRu, chatUnreadCount, clientChatAttention, clientChatKinds, isChatUnreadFor } from '../../../src/lib/chat/chatAccessCore.js'
import { chatReactorKey, chatUnseenReaction } from '../../../src/lib/chat/chatReactionCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { chatVoiceOf, openChatThread, reactChatMessage, searchChatThread, sendChatMessage } from './chatConversation.js'
import { isMissingChatTable, loadClientThreads, loadStaffNames } from './chatStore.js'

const UNAVAILABLE_RU = 'Сообщения пока недоступны — попробуйте позже'

/** Число непрочитанных диалогов для конверта (GET /api/client-me) — только те, что видны в списке. До миграции — 0. */
export async function loadClientChatAttention(db, client) {
  try {
    return clientChatAttention(client, await loadClientThreads(db, client.id))
  } catch (e) {
    if (isMissingChatTable(e)) return 0
    throw e
  }
}

async function listThreads(db, client) {
  const byKind = new Map((await loadClientThreads(db, client.id)).map((t) => [t.kind, t]))
  const names = await loadStaffNames(db, [client.trainer_id])
  const trainerName = names.get(String(client.trainer_id ?? '')) ?? ''
  const threads = clientChatKinds(client).map((kind) => {
    const t = byKind.get(kind)
    return {
      kind,
      label: chatKindLabelRu(kind),
      name: kind === 'trainer' ? trainerName : '',
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

export async function handleClientChatPost(db, ctx, body, res) {
  const client = ctx.client
  const kind = String(body?.kind ?? '')
  try {
    if (body.action === 'chat-list') {
      sendJson(res, 200, await listThreads(db, client))
      return
    }
    if (!clientChatKinds(client).includes(kind)) {
      sendJson(res, 404, { error: kind === 'trainer' ? 'Тренер пока не назначен' : 'Диалог не найден' })
      return
    }
    if (body.action === 'chat-thread') {
      const [page, names] = await Promise.all([
        openChatThread(db, {
          client,
          kind,
          side: 'client',
          reactor: chatReactorKey('client', client.id),
          before: body.before,
          markRead: chatSeenFromRequest(body.seen),
        }),
        kind === 'trainer' ? loadStaffNames(db, [client.trainer_id]) : new Map(),
      ])
      sendJson(res, 200, { ...page, kind, name: names.get(String(client.trainer_id ?? '')) ?? '' })
      return
    }
    if (body.action === 'chat-send') {
      const out = await sendChatMessage(db, {
        client,
        kind,
        side: 'client',
        body: body.body,
        sticker: body.sticker,
        voice: { audio: body.audio, sec: body.sec, wave: body.wave, once: body.once },
        clientMsgId: body.client_msg_id,
        replyTo: body.reply_to,
        silent: body.silent === true,
      })
      sendJson(res, out.status, out.body)
      return
    }
    if (body.action === 'chat-voice-audio' || body.action === 'chat-voice-text') {
      const want = body.action === 'chat-voice-text' ? 'text' : 'audio'
      const out = await chatVoiceOf(db, { client, kind, messageId: body.message_id, want, who: `c:${client.id}`, side: 'client' })
      sendJson(res, out.status, out.body)
      return
    }
    if (body.action === 'chat-search') {
      const out = await searchChatThread(db, { client, kind, side: 'client', q: body.q })
      sendJson(res, out.status, out.body)
      return
    }
    if (body.action === 'chat-react') {
      const reactor = chatReactorKey('client', client.id)
      const out = await reactChatMessage(db, { client, kind, reactor, messageId: body.message_id, emoji: body.emoji })
      sendJson(res, out.status, out.body)
      return
    }
    sendJson(res, 400, { error: 'Неизвестное действие' })
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}
