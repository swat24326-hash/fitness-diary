/** Группа АЗ клиента: POST /api/client-me { action: 'az-group-*', instructor_user_id }. */
import { chatSeenParam } from '../chat/chatSeenCore.js'
import { CHAT_VIDEO_FETCH_MS, isVideoOutgoing, videoUploadQuery } from '../chat/chatVideoTransport.js'
import { noteClientChatRead, postClientMe, postClientMeVideo } from './clientSession.js'

const idOf = (instructorUserId) => ({ instructor_user_id: String(instructorUserId ?? '').trim() })

/** @returns {Promise<{ groups: object[] }>} */
export async function fetchClientAzGroups() {
  const data = await postClientMe({ action: 'az-group-list' })
  return { groups: Array.isArray(data?.groups) ? data.groups : [] }
}

export function fetchClientAzGroupThread(instructorUserId, before, seen) {
  return postClientMe({
    action: 'az-group-thread',
    ...idOf(instructorUserId),
    ...(before ? { before } : {}),
    ...chatSeenParam(seen),
  }).then((page) => {
    if (page?.marked_read) noteClientChatRead()
    return page
  })
}

/** @param {{ body: string } | { sticker: string } | { video: Blob, sec: number }} outgoing */
export function sendClientAzGroupMessage(instructorUserId, outgoing) {
  const id = idOf(instructorUserId)
  if (isVideoOutgoing(outgoing)) {
    return postClientMeVideo(videoUploadQuery({ op: 'az-group-send', ...id }, outgoing), outgoing.video)
  }
  return postClientMe({ action: 'az-group-send', ...id, ...outgoing })
}

export function reactClientAzGroupMessage(instructorUserId, messageId, emoji) {
  return postClientMe({ action: 'az-group-react', ...idOf(instructorUserId), message_id: messageId, emoji })
}

export function searchClientAzGroup(instructorUserId, q) {
  return postClientMe({ action: 'az-group-search', ...idOf(instructorUserId), q })
}

export function muteClientAzGroup(instructorUserId, muted) {
  return postClientMe({ action: 'az-group-mute', ...idOf(instructorUserId), muted })
}

export function pinClientAzGroup(instructorUserId, messageId) {
  return postClientMe({ action: 'az-group-pin', ...idOf(instructorUserId), message_id: messageId })
}

export function readersClientAzGroup(instructorUserId, messageId) {
  return postClientMe({ action: 'az-group-readers', ...idOf(instructorUserId), message_id: messageId })
}

export function clientAzGroupVoice(instructorUserId) {
  const id = idOf(instructorUserId)
  const call = (action, timeoutMs) => (messageId) => postClientMe({ action, ...id, message_id: messageId }, { timeoutMs })
  return { audio: call('az-group-voice-audio'), text: call('az-group-voice-text'), file: call('az-group-attach', CHAT_VIDEO_FETCH_MS) }
}

/** Тот же набор, что staffAzGroupApi / coachAzGroupApi — для useAzGroupThread. */
export function clientAzGroupApi(instructorUserId) {
  return {
    load: (before, seen) => fetchClientAzGroupThread(instructorUserId, before, seen),
    send: (outgoing) => sendClientAzGroupMessage(instructorUserId, outgoing),
    react: (messageId, emoji) => reactClientAzGroupMessage(instructorUserId, messageId, emoji),
    search: (q) => searchClientAzGroup(instructorUserId, q),
    mute: (muted) => muteClientAzGroup(instructorUserId, muted),
    pin: (messageId) => pinClientAzGroup(instructorUserId, messageId),
    readers: (messageId) => readersClientAzGroup(instructorUserId, messageId),
    voice: clientAzGroupVoice(instructorUserId),
  }
}
