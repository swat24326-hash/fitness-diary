/** Переписка клиента: POST /api/client-me { action: 'chat-*' }. Только при сети — сообщение пишет сервер. */
import { chatSeenParam } from '../chat/chatSeenCore.js'
import { postClientMe } from './clientSession.js'

export async function fetchClientChats() {
  const data = await postClientMe({ action: 'chat-list' })
  return { threads: Array.isArray(data?.threads) ? data.threads : [], attention: Number(data?.attention) || 0 }
}

/** Последняя страница (сервер отмечает прочитанным; seen=false — читает историю, не отмечать) или более старая — before. */
export function fetchClientChatThread(kind, before, seen) {
  return postClientMe({ action: 'chat-thread', kind, ...(before ? { before } : {}), ...chatSeenParam(seen) })
}

/** @param {{ body: string } | { sticker: string }} outgoing */
export function sendClientChatMessage(kind, outgoing) {
  return postClientMe({ action: 'chat-send', kind, ...outgoing })
}

/** emoji null — снять свою реакцию. @returns {Promise<{ message_id: string, reactions: object[] }>} */
/** Поиск по своему диалогу. @returns {Promise<{ results: object[] }>} */
export function searchClientChat(kind, q) {
  return postClientMe({ action: 'chat-search', kind, q })
}

/** Голосовые своего диалога: звук ({ audio, mime }, сутки) и «→ Аа» ({ done, text? } — спрашивать, пока не done). */
export function clientChatVoice(kind) {
  const call = (action) => (messageId) => postClientMe({ action, kind, message_id: messageId })
  return { audio: call('chat-voice-audio'), text: call('chat-voice-text') }
}

export function reactClientChatMessage(kind, messageId, emoji) {
  return postClientMe({ action: 'chat-react', kind, message_id: messageId, emoji })
}
