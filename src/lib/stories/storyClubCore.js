/**
 * Реклама клуба в сторис: кто выкладывает, чей клуб, срок, кадры.
 * Свои сторис людей здесь нет. Без React и базы.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ADMIN = new Set(['admin', 'администратор'])
const SUPERVISOR = new Set(['supervisor', 'управляющий'])

export const STORY_LABELS = Object.freeze(['news', 'promo'])
export const STORY_CTA = Object.freeze(['none', 'chat', 'membership'])
export const STORY_MAX_FRAMES = 5
export const STORY_CAPTION_MAX = 200
export const STORY_MIN_DAYS = 1
export const STORY_MAX_DAYS = 7
export const STORY_PHOTO_MAX_BYTES = 650_000

export const STORY_FORBIDDEN_RU = 'Выложить сторис клуба могут администратор и управляющий'
export const STORY_PICK_CLUB_RU = 'Выберите клуб'
export const STORY_OTHER_CLUB_RU = 'Это чужой клуб'
export const STORY_NO_CLUB_RU = 'У вас не задан клуб — обратитесь к администратору'
export const STORY_BAD_RU = 'Проверьте фото, подпись и срок'
export const STORY_GONE_RU = 'Сторис уже нет'
export const STORY_OFFLINE_RU = 'Сторис откроются, когда появится связь'
export const STORY_UNAVAILABLE_RU = 'Сторис пока недоступны'

const LABEL_RU = Object.freeze({ news: 'Новость', promo: 'Акция' })
const EXT = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })

export function storyUuid(raw) {
  return UUID_RE.test(String(raw ?? '').trim())
}

/** @returns {'admin' | 'supervisor' | 'staff'} */
export function storyStaffKind(role) {
  const r = String(role ?? '').trim().toLowerCase()
  if (ADMIN.has(r)) return 'admin'
  if (SUPERVISOR.has(r)) return 'supervisor'
  return 'staff'
}

export function canPublishClubStory(kind) {
  return kind === 'admin' || kind === 'supervisor'
}

export function storyLabelRu(label) {
  return LABEL_RU[label] ?? 'Новость'
}

/**
 * Клуб, в который можно выложить.
 * @returns {{ ok: true, clubId: string } | { ok: false, error: string }}
 */
export function publishClubId({ kind, ownClubId, requestedClubId }) {
  if (!canPublishClubStory(kind)) return { ok: false, error: STORY_FORBIDDEN_RU }
  const own = String(ownClubId ?? '').trim()
  const asked = String(requestedClubId ?? '').trim()
  if (kind === 'admin') {
    if (!storyUuid(asked)) return { ok: false, error: STORY_PICK_CLUB_RU }
    return { ok: true, clubId: asked }
  }
  if (!storyUuid(own)) return { ok: false, error: STORY_NO_CLUB_RU }
  if (asked && asked !== own) return { ok: false, error: STORY_OTHER_CLUB_RU }
  return { ok: true, clubId: own }
}

/**
 * Клуб, чью рекламу человек смотрит.
 * @returns {{ ok: true, clubId: string } | { ok: false, error: string }}
 */
export function viewClubId({ kind, ownClubId, requestedClubId }) {
  const own = String(ownClubId ?? '').trim()
  const asked = String(requestedClubId ?? '').trim()
  if (kind === 'admin') {
    if (!storyUuid(asked)) return { ok: false, error: STORY_PICK_CLUB_RU }
    return { ok: true, clubId: asked }
  }
  if (!storyUuid(own)) return { ok: false, error: STORY_NO_CLUB_RU }
  if (asked && asked !== own) return { ok: false, error: STORY_OTHER_CLUB_RU }
  return { ok: true, clubId: own }
}

export function storyDaysOk(days) {
  const n = Number(days)
  return Number.isInteger(n) && n >= STORY_MIN_DAYS && n <= STORY_MAX_DAYS
}

export function storyExpiresAt(nowMs, days) {
  return new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString()
}

export function storyIsLive(row, nowMs) {
  if (!row || row.removedAt) return false
  const exp = Date.parse(row.expiresAt)
  return Number.isFinite(exp) && exp > nowMs
}

/** @returns {{ ok: true, caption: string } | { ok: false }} */
export function storyCaptionOk(raw) {
  const caption = String(raw ?? '').replace(/\r\n?/g, '\n').trim()
  if (caption.length > STORY_CAPTION_MAX) return { ok: false }
  return { ok: true, caption }
}

export function storyCtaOk(cta) {
  return STORY_CTA.includes(cta) ? cta : null
}

export function storyFramesOk(count) {
  return Number.isInteger(count) && count >= 1 && count <= STORY_MAX_FRAMES
}

export function storyPhotoBytesOk(bytes) {
  return Number.isInteger(bytes) && bytes >= 100 && bytes <= STORY_PHOTO_MAX_BYTES
}

/** Дуги кольца: одно фото — круг, два — полукруги. Яркость решает seen сторис. */
export function storyRingSegments(stories) {
  const items = []
  for (const story of stories ?? []) {
    const frames = Array.isArray(story?.frames) && story.frames.length ? story.frames : [{ id: story?.id }]
    for (const frame of frames) {
      items.push({ id: `${story?.id}:${frame?.id ?? items.length}`, seen: Boolean(story?.seen) })
    }
  }
  const n = items.length
  if (!n) return []
  const gap = n === 1 ? 0 : Math.min(0.045, 0.5 / n)
  const sweep = (1 - gap * n) / n
  return items.map((item, i) => ({ ...item, start: i * (sweep + gap), sweep }))
}

export function canRemoveClubStory(kind, { authorId, userId }) {
  if (kind === 'admin' || kind === 'supervisor') return true
  return Boolean(authorId) && authorId === userId
}

export function storyViewerKey(side, id) {
  const who = side === 'client' ? 'c' : 'u'
  return `${who}:${String(id).toLowerCase()}`
}

const VIEWER_KEY = /^(u|c):([0-9a-f-]{36})$/

/** Имена зрителей для своего клуба. Чужой ключ и сырой id наружу не отдаём. */
export function storyViewerPublic(rows, names) {
  const list = []
  for (const row of rows ?? []) {
    const key = String(row?.user_key ?? '').toLowerCase()
    const match = VIEWER_KEY.exec(key)
    if (!match) continue
    const side = match[1] === 'c' ? 'client' : 'staff'
    const name = String(names?.[key] ?? '').trim()
    list.push({
      name: name || (side === 'client' ? 'Клиент' : 'Сотрудник'),
      side,
      seen_at: row.seen_at ?? null,
    })
  }
  list.sort((a, b) => String(b.seen_at ?? '').localeCompare(String(a.seen_at ?? '')))
  return list
}

export function storyStorageKey(clubId, storyId, pos, mime) {
  const ext = EXT[mime] ?? 'bin'
  return `story/${String(clubId).toLowerCase()}/${String(storyId).toLowerCase()}/${pos}.${ext}`
}

export function isStoryStorageKey(key) {
  return /^story\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/\d\.(jpg|png|webp)$/.test(String(key ?? ''))
}
