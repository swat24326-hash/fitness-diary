/** Переписка клиента: POST /api/client-me { action: 'chat-*' }. Только при сети — сообщение пишет сервер. */
import { chatSeenParam } from '../chat/chatSeenCore.js'
import { CHAT_VIDEO_FETCH_MS, isVideoOutgoing, videoUploadQuery } from '../chat/chatVideoTransport.js'
import { postClientMe, postClientMeVideo } from './clientSession.js'

export async function fetchClientChats() {
  const data = await postClientMe({ action: 'chat-list' })
  return { threads: Array.isArray(data?.threads) ? data.threads : [], attention: Number(data?.attention) || 0 }
}

/** Последняя страница (сервер отмечает прочитанным; seen=false — читает историю, не отмечать) или более старая — before. */
export function fetchClientChatThread(kind, before, seen) {
  return postClientMe({ action: 'chat-thread', kind, ...(before ? { before } : {}), ...chatSeenParam(seen) })
}

/** @param {{ body: string } | { sticker: string } | { video: Blob, sec: number }} outgoing видео — бинарным запросом */
export function sendClientChatMessage(kind, outgoing) {
  if (isVideoOutgoing(outgoing)) return postClientMeVideo(videoUploadQuery({ op: 'chat-send', kind }, outgoing), outgoing.video)
  return postClientMe({ action: 'chat-send', kind, ...outgoing })
}

/** emoji null — снять свою реакцию. @returns {Promise<{ message_id: string, reactions: object[] }>} */
/** Поиск по своему диалогу. @returns {Promise<{ results: object[] }>} */
export function searchClientChat(kind, q) {
  return postClientMe({ action: 'chat-search', kind, q })
}

/**
 * Файлы своего диалога: звук голосового ({ audio, mime }), «→ Аа» ({ done, text? }), фото / PDF ({ data, mime, name }),
 * видеокружок ({ blob, mime }) — сутки.
 */
export function clientChatVoice(kind) {
  const call = (action, timeoutMs) => (messageId) => postClientMe({ action, kind, message_id: messageId }, { timeoutMs })
  return { audio: call('chat-voice-audio'), text: call('chat-voice-text'), file: call('chat-attach', CHAT_VIDEO_FETCH_MS) }
}

export function reactClientChatMessage(kind, messageId, emoji) {
  return postClientMe({ action: 'chat-react', kind, message_id: messageId, emoji })
}
