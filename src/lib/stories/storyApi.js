/** Реклама клуба в сторис. Только онлайн — очередь sync не трогаем. */
import { postClientMe } from '../client/clientSession.js'
import { coachRequest } from '../coach/coachSession.js'
import { inboxApiCall } from '../inbox/inboxAdminApiClient.js'

const SLOW = 60_000

export function fetchStaffStories(clubId) {
  return inboxApiCall('stories', 'GET', clubId ? { club_id: clubId } : {})
}

export function publishStaffStory(body) {
  return inboxApiCall('stories', 'POST', {}, { op: 'publish', ...body }, { timeoutMs: SLOW })
}

export function removeStaffStory(id) {
  return inboxApiCall('stories', 'POST', {}, { op: 'remove', id })
}

export function seenStaffStory(id) {
  return inboxApiCall('stories', 'POST', {}, { op: 'seen', id })
}

export function fetchStaffStoryFrame(id, frameId) {
  return inboxApiCall('stories', 'POST', {}, { op: 'frame', id, frame_id: frameId })
}

export function fetchCoachStories() {
  return coachRequest({ view: 'stories' })
}

export function publishCoachStory(body) {
  return coachRequest({}, { op: 'story-publish', ...body }, { timeoutMs: SLOW })
}

export function removeCoachStory(id) {
  return coachRequest({}, { op: 'story-remove', id })
}

export function seenCoachStory(id) {
  return coachRequest({}, { op: 'story-seen', id })
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

export function fetchClientStoryFrame(id, frameId) {
  return postClientMe({ action: 'story-frame', id, frame_id: frameId })
}
