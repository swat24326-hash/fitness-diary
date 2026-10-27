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

export function publishCoachStory(body) {
  return coachRequest({}, { op: 'story-publish', ...body }, { timeoutMs: SLOW })
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
