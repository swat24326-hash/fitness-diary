/** Переписка клиента: POST /api/client-me { action: 'chat-*' }. Только при сети — сообщение пишет сервер. */
import { chatSeenParam } from '../chat/chatSeenCore.js'
import { CHAT_VIDEO_FETCH_MS, isVideoOutgoing, videoUploadQuery } from '../chat/chatVideoTransport.js'
import { postClientMe, postClientMeVideo } from './clientSession.js'

function peerFields(peerUserId) {
  const peer = String(peerUserId ?? '').trim()
  return peer ? { peer_user_id: peer } : {}
}

export async function fetchClientChats() {
  const data = await postClientMe({ action: 'chat-list' })
  return { threads: Array.isArray(data?.threads) ? data.threads : [], attention: Number(data?.attention) || 0 }
}

/** Последняя страница (сервер отмечает прочитанным; seen=false — читает историю, не отмечать) или более старая — before. */
export function fetchClientChatThread(kind, before, seen, peerUserId = null) {
  return postClientMe({
    action: 'chat-thread',
    kind,
    ...peerFields(peerUserId),
    ...(before ? { before } : {}),
    ...chatSeenParam(seen),
  })
}

/** @param {{ body: string } | { sticker: string } | { video: Blob, sec: number }} outgoing видео — бинарным запросом */
export function sendClientChatMessage(kind, outgoing, peerUserId = null) {
  const peer = peerFields(peerUserId)
  if (isVideoOutgoing(outgoing)) {
    return postClientMeVideo(videoUploadQuery({ op: 'chat-send', kind, ...peer }, outgoing), outgoing.video)
  }
  return postClientMe({ action: 'chat-send', kind, ...peer, ...outgoing })
}

/** Поиск по своему диалогу. @returns {Promise<{ results: object[] }>} */
export function searchClientChat(kind, q, peerUserId = null) {
  return postClientMe({ action: 'chat-search', kind, ...peerFields(peerUserId), q })
}

/**
 * Файлы своего диалога: звук голосового ({ audio, mime }), «→ Аа» ({ done, text? }), фото / PDF ({ data, mime, name }),
 * видеокружок ({ blob, mime }) — сутки.
 */
export function clientChatVoice(kind, peerUserId = null) {
  const peer = peerFields(peerUserId)
  const call = (action, timeoutMs) => (messageId) =>
    postClientMe({ action, kind, ...peer, message_id: messageId }, { timeoutMs })
  return { audio: call('chat-voice-audio'), text: call('chat-voice-text'), file: call('chat-attach', CHAT_VIDEO_FETCH_MS) }
}

export function reactClientChatMessage(kind, messageId, emoji, peerUserId = null) {
  return postClientMe({ action: 'chat-react', kind, ...peerFields(peerUserId), message_id: messageId, emoji })
}
