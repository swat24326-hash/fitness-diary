/**
 * Короткий JWT на кадр сторис: <video src> без Bearer.
 * typ: story_media — только ключ в Object Storage + mime.
 */
import { signOwnJwt, verifyOwnJwt } from '../authOwnCore.js'
import { isStoryStorageKey } from '../../../src/lib/stories/storyClubCore.js'

export const STORY_MEDIA_TTL_SEC = 2 * 60 * 60

/**
 * @param {{ key: string, mime: string, nowSec?: number, ttlSec?: number }} p
 * @param {string} secret
 * @returns {string | null}
 */
export function signStoryMediaToken({ key, mime, nowSec, ttlSec = STORY_MEDIA_TTL_SEC }, secret) {
  const storageKey = String(key || '')
  const type = String(mime || '').split(';')[0].trim()
  if (!secret || !isStoryStorageKey(storageKey) || !type.startsWith('video/')) return null
  const now = Math.floor(Number(nowSec) || Date.now() / 1000)
  return signOwnJwt(
    {
      typ: 'story_media',
      key: storageKey,
      mime: type,
      exp: now + Math.max(60, Number(ttlSec) || STORY_MEDIA_TTL_SEC),
    },
    secret,
  )
}

/**
 * @param {string} token
 * @param {string} secret
 * @param {number} [nowSec]
 * @returns {{ ok: true, key: string, mime: string } | { ok: false, error: string }}
 */
export function verifyStoryMediaToken(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const { payload, error } = verifyOwnJwt(token, secret, nowSec)
  if (!payload) return { ok: false, error: error || 'Ссылка устарела — откройте сторис снова' }
  if (payload.typ !== 'story_media') return { ok: false, error: 'Ссылка недействительна' }
  const key = String(payload.key || '')
  const mime = String(payload.mime || '').split(';')[0].trim()
  if (!isStoryStorageKey(key) || !mime.startsWith('video/')) {
    return { ok: false, error: 'Ссылка недействительна' }
  }
  return { ok: true, key, mime }
}

/**
 * @param {string} token
 * @returns {string}
 */
export function storyMediaSrcPath(token) {
  return `/api/story-media?t=${encodeURIComponent(token)}`
}
