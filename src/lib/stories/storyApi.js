/** Реклама клуба в сторис. Только онлайн — очередь sync не трогаем. */
import { postClientMe } from '../client/clientSession.js'
import { coachRequest } from '../coach/coachSession.js'
import { CHAT_VIDEO_FETCH_MS } from '../chat/chatVideoTransport.js'
import { inboxApiCall } from '../inbox/inboxAdminApiClient.js'
import { storyPublishBatches } from './storyPublishCore.js'

const SLOW = 60_000

export function fetchStaffStories(clubId) {
  return inboxApiCall('stories', 'GET', clubId ? { club_id: clubId } : {})
}

function publishStaffPhotos(clubId, frames) {
  return inboxApiCall(
    'stories',
    'POST',
    {},
    {
      op: 'publish',
      club_id: clubId,
      frames: frames.map(({ data, w, h, caption }) => ({ data, w, h, caption })),
    },
    { timeoutMs: SLOW },
  )
}

function publishStaffVideo(clubId, frame) {
  const params = {
    op: 'publish-video',
    sec: String(frame.sec),
    ...(clubId ? { club_id: clubId } : {}),
    ...(frame.caption ? { caption: String(frame.caption) } : {}),
  }
  return inboxApiCall('stories', 'POST', params, null, {
    raw: frame.blob,
    timeoutMs: CHAT_VIDEO_FETCH_MS,
  })
}

/** Фото JSON; видео — бинарно (как в чате). Смесь — несколько сторис подряд. */
export async function publishStaffStory(body) {
  const clubId = body?.club_id
  const batches = storyPublishBatches(body?.frames)
  if (!batches.length) throw new Error('Добавьте хотя бы одно фото или видео')
  let pack = null
  for (const batch of batches) {
    pack = batch[0]?.kind === 'video' ? await publishStaffVideo(clubId, batch[0]) : await publishStaffPhotos(clubId, batch)
  }
  return pack
}

export function removeStaffStory(id) {
  return inboxApiCall('stories', 'POST', {}, { op: 'remove', id })
}

export function banStaffStoryPublish(userId, clubId) {
  return inboxApiCall('stories', 'POST', {}, { op: 'ban-publish', user_id: userId, club_id: clubId })
}

export function unbanStaffStoryPublish(userId, clubId) {
  return inboxApiCall('stories', 'POST', {}, { op: 'unban-publish', user_id: userId, club_id: clubId })
}

export function seenStaffStory(id) {
  return inboxApiCall('stories', 'POST', {}, { op: 'seen', id })
}

export function reactStaffStory(id, emoji) {
  return inboxApiCall('stories', 'POST', {}, { op: 'react', id, emoji })
}

export function fetchStaffStoryFrame(id, frameId) {
  return inboxApiCall('stories', 'POST', {}, { op: 'frame', id, frame_id: frameId })
}

export function fetchCoachStories() {
  return coachRequest({ view: 'stories' })
}

function publishCoachPhotos(frames) {
  return coachRequest(
    {},
    {
      op: 'story-publish',
      frames: frames.map(({ data, w, h, caption }) => ({ data, w, h, caption })),
    },
    { timeoutMs: SLOW },
  )
}

function publishCoachVideo(frame) {
  return coachRequest(
    {
      op: 'story-publish-video',
      sec: String(frame.sec),
      ...(frame.caption ? { caption: String(frame.caption) } : {}),
    },
    null,
    { raw: frame.blob, timeoutMs: CHAT_VIDEO_FETCH_MS },
  )
}

export async function publishCoachStory(body) {
  const batches = storyPublishBatches(body?.frames)
  if (!batches.length) throw new Error('Добавьте хотя бы одно фото или видео')
  let pack = null
  for (const batch of batches) {
    pack = batch[0]?.kind === 'video' ? await publishCoachVideo(batch[0]) : await publishCoachPhotos(batch)
  }
  return pack
}

export function removeCoachStory(id) {
  return coachRequest({}, { op: 'story-remove', id })
}

export function banCoachStoryPublish(userId) {
  return coachRequest({}, { op: 'story-ban-publish', user_id: userId })
}

export function unbanCoachStoryPublish(userId) {
  return coachRequest({}, { op: 'story-unban-publish', user_id: userId })
}

export function seenCoachStory(id) {
  return coachRequest({}, { op: 'story-seen', id })
}

export function reactCoachStory(id, emoji) {
  return coachRequest({}, { op: 'story-react', id, emoji })
}

export function fetchCoachStoryFrame(id, frameId) {
  return coachRequest({}, { op: 'story-frame', id, frame_id: frameId })
}

export function fetchClientStories() {
  return postClientMe({ action: 'story-list' })
}

export function seenClientStory(id) {
  return postClientMe({ action: 'story-seen', id })
}

export function reactClientStory(id, emoji) {
  return postClientMe({ action: 'story-react', id, emoji })
}

export function fetchClientStoryFrame(id, frameId) {
  return postClientMe({ action: 'story-frame', id, frame_id: frameId })
}
