/**
 * Переписка клиента через /api/client-me (токен клиента, только свои диалоги).
 * POST { action: 'chat-list' } | { action: 'chat-thread', kind, before? } (отмечает прочитанным) | { action: 'chat-send', kind, body }
 */
import { sendJson } from '../adminSupabase.js'
import { chatKindLabelRu, chatUnreadCount, clientChatKinds, isChatUnreadFor } from '../../../src/lib/chat/chatAccessCore.js'
import { openChatThread, sendChatMessage } from './chatConversation.js'
import { isMissingChatTable, loadClientThreads, loadStaffNames } from './chatStore.js'

const UNAVAILABLE_RU = 'Сообщения пока недоступны — попробуйте позже'

/** Число непрочитанных диалогов для конверта (GET /api/client-me). До миграции — 0. */
export async function loadClientChatAttention(db, clientId) {
  try {
    return (await loadClientThreads(db, clientId)).filter((t) => isChatUnreadFor('client', t)).length
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
        openChatThread(db, { client, kind, side: 'client', before: body.before }),
        kind === 'trainer' ? loadStaffNames(db, [client.trainer_id]) : new Map(),
      ])
      sendJson(res, 200, { ...page, kind, name: names.get(String(client.trainer_id ?? '')) ?? '' })
      return
    }
    if (body.action === 'chat-send') {
      const out = await sendChatMessage(db, { client, kind, side: 'client', body: body.body, sticker: body.sticker })
      sendJson(res, out.status, out.body)
      return
    }
    sendJson(res, 400, { error: 'Неизвестное действие' })
  } catch (e) {
    if (!isMissingChatTable(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}
