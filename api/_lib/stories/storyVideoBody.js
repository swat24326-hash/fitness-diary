/**
 * Бинарная выкладка видео в сторис: тело — байты video/*, метаданные в query
 * (op=publish-video | story-publish-video, sec, club_id?, caption?, label?, cta?).
 */
import { videoMetaFromQuery } from '../../../src/lib/chat/chatVideoCore.js'
import { isVideoUpload } from '../chat/chatVideoHandler.js'

const one = (v) => (Array.isArray(v) ? v[0] : v)

/**
 * op оставляем как в query: staff — publish-video, coach — story-publish-video
 * (coachHandler срезает префикс story- перед storyHandler).
 * @returns {null | { op: string, club_id?: string, caption: string, label?: string, cta?: string, video: { buffer: Buffer, sec: string } }}
 */
export function storyVideoPublishBody(req) {
  if (!isVideoUpload(req)) return null
  const q = req?.query ?? {}
  const rawOp = String(one(q.op) ?? '')
  if (rawOp !== 'publish-video' && rawOp !== 'story-publish-video') return null
  const meta = videoMetaFromQuery(q)
  const club = one(q.club_id)
  const caption = one(q.caption)
  const label = one(q.label)
  const cta = one(q.cta)
  return {
    op: rawOp,
    ...(club != null && String(club).trim() ? { club_id: String(club).trim() } : {}),
    caption: caption == null ? '' : String(caption),
    ...(label != null && String(label).trim() ? { label: String(label).trim() } : {}),
    ...(cta != null && String(cta).trim() ? { cta: String(cta).trim() } : {}),
    video: { buffer: req.body, sec: meta.sec },
  }
}
