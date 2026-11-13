/**
 * Подмена сторис для /api/client-me (story-list / frame / seen / react).
 * Кадр — крошечный PNG в base64 (как photo на проде).
 */
import { randomUUID } from 'node:crypto'

/** 1×1 PNG */
export const STORY_TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * @param {object} state
 * @param {{ clubId: string, authorId: string, authorName: string, clubName?: string }} opts
 */
export function seedClientStories(state, { clubId, authorId, authorName, clubName = 'E2E клуб' }) {
  const storyId = randomUUID()
  const frameId = randomUUID()
  const now = Date.now()
  state.club_stories = [
    {
      id: storyId,
      club_id: clubId,
      club_name: clubName,
      author_id: authorId,
      author_name: authorName,
      author_photo: null,
      label: 'news',
      label_ru: 'Новость',
      cta: null,
      created_at: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now + 86_400_000).toISOString(),
      network: true,
      frames: [{ id: frameId, caption: 'E2E кадр', w: 1, h: 1, mime: 'image/png' }],
      bytes_b64: STORY_TINY_PNG_B64,
    },
  ]
  state.club_story_views = []
  return { storyId, frameId, authorName }
}

/**
 * @param {object} state
 * @param {{ clientId: string, clubId: string, body: object }} ctx
 */
export function handleClientStoryAction(state, { clientId, clubId, body }) {
  const action = String(body?.action ?? '')
  const stories = state.club_stories ?? []
  const views = (state.club_story_views ??= [])
  const viewerKey = `client:${clientId}`

  if (action === 'story-list') {
    const items = stories.map((s) => {
      const mine = views.find((v) => v.story_id === s.id && v.user_key === viewerKey)
      return {
        id: s.id,
        club_id: s.club_id,
        club_name: s.club_name,
        network: Boolean(s.network),
        label: s.label,
        label_ru: s.label_ru,
        cta: s.cta,
        created_at: s.created_at,
        expires_at: s.expires_at,
        seen: Boolean(mine),
        can_remove: false,
        can_react: true,
        my_reaction: mine?.reaction ?? null,
        author_name: s.author_name,
        author_id: s.author_id,
        author_photo: s.author_photo,
        frames: s.frames,
      }
    })
    return { status: 200, json: { stories: items, own_club_id: String(clubId).toLowerCase() } }
  }

  if (action === 'story-frame') {
    const story = stories.find((s) => s.id === body.id)
    const frame = story?.frames?.find((f) => f.id === body.frame_id)
    if (!story || !frame) return { status: 404, json: { error: 'Кадр не найден' } }
    return { status: 200, json: { data: story.bytes_b64 || STORY_TINY_PNG_B64, mime: frame.mime || 'image/png' } }
  }

  if (action === 'story-seen') {
    const story = stories.find((s) => s.id === body.id)
    if (!story) return { status: 404, json: { error: 'Сторис не найдена' } }
    let row = views.find((v) => v.story_id === story.id && v.user_key === viewerKey)
    if (!row) {
      row = { story_id: story.id, user_key: viewerKey, seen_at: new Date().toISOString(), reaction: null }
      views.push(row)
    }
    return { status: 200, json: { ok: true } }
  }

  if (action === 'story-react') {
    const story = stories.find((s) => s.id === body.id)
    if (!story) return { status: 404, json: { error: 'Сторис не найдена' } }
    const emoji = String(body.emoji ?? '').trim() || null
    let row = views.find((v) => v.story_id === story.id && v.user_key === viewerKey)
    if (!row) {
      row = { story_id: story.id, user_key: viewerKey, seen_at: new Date().toISOString(), reaction: emoji }
      views.push(row)
    } else {
      row.reaction = row.reaction === emoji ? null : emoji
    }
    return { status: 200, json: { ok: true, reaction: row.reaction } }
  }

  return { status: 400, json: { error: 'Неизвестное действие' } }
}
