/** Переписка клиента: POST /api/client-me { action: 'chat-*' }. Только при сети — сообщение пишет сервер. */
import { postClientMe } from './clientSession.js'

export async function fetchClientChats() {
  const data = await postClientMe({ action: 'chat-list' })
  return { threads: Array.isArray(data?.threads) ? data.threads : [], attention: Number(data?.attention) || 0 }
}

/** Последняя страница (сервер отмечает прочитанным) или более старая — before. */
export function fetchClientChatThread(kind, before) {
  return postClientMe({ action: 'chat-thread', kind, ...(before ? { before } : {}) })
}

/** @param {{ body: string } | { sticker: string }} outgoing */
export function sendClientChatMessage(kind, outgoing) {
  return postClientMe({ action: 'chat-send', kind, ...outgoing })
}
