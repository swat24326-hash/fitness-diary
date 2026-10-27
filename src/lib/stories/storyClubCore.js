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
/** Как в Telegram: сторис клуба живёт ровно сутки. */
export const STORY_LIFETIME_DAYS = 1
export const STORY_MIN_DAYS = STORY_LIFETIME_DAYS
export const STORY_MAX_DAYS = STORY_LIFETIME_DAYS
export const STORY_PHOTO_MAX_BYTES = 650_000
/** Видео в кадре — как в чате: бинарный POST до 15 МБ / 60 с. */
export const STORY_VIDEO_MAX_BYTES = 15 * 1024 * 1024
export const STORY_VIDEO_MAX_SEC = 60
export const STORY_VIDEO_MIN_SEC = 1
/** Фото без видео — полоска ~5 с. */
export const STORY_PHOTO_SEC = 5
/** Подпись кружка без выбора «вид» в UI. */
export const STORY_DEFAULT_LABEL = 'news'
/** Без кнопки у клиента — как обычная сторис в Telegram. */
export const STORY_DEFAULT_CTA = 'none'

export const STORY_FORBIDDEN_RU = 'Выложить сторис клуба могут сотрудники этого клуба'
export const STORY_BANNED_RU = 'Вам запретили выкладывать сторис клуба — обратитесь к управляющему'
export const STORY_BAN_TARGET_RU = 'Запретить выкладку можно только сотруднику клуба'
export const STORY_PICK_CLUB_RU = 'Выберите клуб'
export const STORY_OTHER_CLUB_RU = 'Это чужой клуб'
export const STORY_NO_CLUB_RU = 'У вас не задан клуб — обратитесь к администратору'
export const STORY_BAD_RU = 'Проверьте фото и подпись'
export const STORY_VIDEO_BAD_RU = 'Видео не подошло — до 60 секунд и не слишком тяжёлое'
export const STORY_VIDEO_JSON_RU = 'Видео выкладывайте как файл — через камеру или из галереи'
export const STORY_GONE_RU = 'Сторис уже нет'
export const STORY_OFFLINE_RU = 'Сторис откроются, когда появится связь'
export const STORY_UNAVAILABLE_RU = 'Сторис пока недоступны'
export const STORY_REACT_OWN_RU = 'На свою сторис реакцию не ставят'
export const STORY_REACT_BAD_RU = 'Такую реакцию поставить нельзя'

/** Как в чате: быстрая полоска без личных сообщений. */
export const STORY_REACTIONS = Object.freeze(['👍', '❤️', '🔥', '💪', '😂', '🙏'])

const LABEL_RU = Object.freeze({ news: 'Новость', promo: 'Акция' })
const EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
})

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
  return kind === 'admin' || kind === 'supervisor' || kind === 'staff'
}

/** Админ и управляющий: снять чужую, запретить сотруднику выкладывать. */
export function canModerateClubStoryPublish(kind) {
  return kind === 'admin' || kind === 'supervisor'
}

/**
 * Кого можно лишить выкладки. Цель — только сотрудник; себя и админ/управляющего — нет.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function canBanClubStoryAuthor(moderatorKind, { targetKind, targetUserId, moderatorUserId }) {
  if (!canModerateClubStoryPublish(moderatorKind)) return { ok: false, error: STORY_FORBIDDEN_RU }
  const target = String(targetUserId ?? '').trim().toLowerCase()
  const self = String(moderatorUserId ?? '').trim().toLowerCase()
  if (!storyUuid(target) || !self || target === self) return { ok: false, error: STORY_BAN_TARGET_RU }
  if (targetKind !== 'staff') return { ok: false, error: STORY_BAN_TARGET_RU }
  return { ok: true }
}

/** Роль позволяет и нет бана по клубу. */
export function canPublishClubStoryNow(kind, banned) {
  return canPublishClubStory(kind) && !banned
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

export function storyVideoBytesOk(bytes) {
  return Number.isInteger(bytes) && bytes >= 1000 && bytes <= STORY_VIDEO_MAX_BYTES
}

export function storyVideoSecOk(sec) {
  const n = Number(sec)
  return Number.isInteger(n) && n >= STORY_VIDEO_MIN_SEC && n <= STORY_VIDEO_MAX_SEC
}

export function storyMimeIsVideo(mime) {
  return String(mime ?? '').startsWith('video/')
}

/**
 * Время у шапки сторис как в Telegram: «сегодня · 14:32» или «25.10 · 14:32».
 * @param {string|null|undefined} iso
 * @param {number} [nowMs]
 */
export function storyPostedShortRu(iso, nowMs = Date.now()) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const clock = `${hh}:${mm}`
  const now = new Date(nowMs)
  if (d.toDateString() === now.toDateString()) return `сегодня · ${clock}`
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}.${month} · ${clock}`
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

/** Как в Telegram: снимает только автор. Модератор — через бан выкладки. */
export function canRemoveClubStory(_kind, { authorId, userId }) {
  const author = String(authorId ?? '').trim().toLowerCase()
  const me = String(userId ?? '').trim().toLowerCase()
  return Boolean(author && me && author === me)
}

/** «Кто смотрел» — только у своих сторис. */
export function canSeeClubStoryViewers({ authorId, userId }) {
  return canRemoveClubStory('staff', { authorId, userId })
}

/**
 * Кружки в ряду: один автор — один кружок (как в Telegram).
 * Свои слева, дальше непросмотренные, потом остальные.
 * @returns {{ author_id: string, author_name: string, author_photo: string|null, mine: boolean, unseen: boolean, views: number|null, stories: object[] }[]}
 */
export function groupClubStoryAuthors(stories, { myUserId } = {}) {
  const me = String(myUserId ?? '').trim().toLowerCase()
  const order = []
  const map = new Map()
  for (const story of stories ?? []) {
    const id = String(story?.author_id ?? '').trim().toLowerCase()
    if (!id) continue
    let group = map.get(id)
    if (!group) {
      group = {
        author_id: id,
        author_name: String(story?.author_name ?? '').trim() || 'Сотрудник',
        author_photo: story?.author_photo || null,
        mine: Boolean(me && id === me),
        stories: [],
      }
      map.set(id, group)
      order.push(group)
    } else if (!group.author_photo && story?.author_photo) {
      group.author_photo = story.author_photo
    }
    group.stories.push(story)
  }
  for (const group of order) {
    group.unseen = group.stories.some((s) => !s.seen)
    group.views = group.mine
      ? group.stories.reduce((sum, s) => sum + (Number(s.views) || 0), 0)
      : null
  }
  const mine = order.filter((g) => g.mine)
  const rest = order.filter((g) => !g.mine)
  rest.sort((a, b) => Number(b.unseen) - Number(a.unseen))
  return [...mine, ...rest]
}

export function storyViewerKey(side, id) {
  const who = side === 'client' ? 'c' : 'u'
  return `${who}:${String(id).toLowerCase()}`
}

/**
 * emoji пусто / null — снять. Та же снова — тоже снять (toggle снаружи).
 * @returns {{ ok: true, emoji: string|null } | { ok: false, error: string }}
 */
export function storyReactionOk(raw) {
  if (raw == null || raw === '') return { ok: true, emoji: null }
  const emoji = String(raw)
  return STORY_REACTIONS.includes(emoji) ? { ok: true, emoji } : { ok: false, error: STORY_REACT_BAD_RU }
}

/** Следующее значение: та же — снять, другая — заменить. */
export function storyReactionNext(current, tapped) {
  const want = storyReactionOk(tapped)
  if (!want.ok) return want
  if (!want.emoji) return { ok: true, emoji: null }
  if (current === want.emoji) return { ok: true, emoji: null }
  return { ok: true, emoji: want.emoji }
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
    const reaction = STORY_REACTIONS.includes(row?.reaction) ? row.reaction : null
    list.push({
      name: name || (side === 'client' ? 'Клиент' : 'Сотрудник'),
      side,
      seen_at: row.seen_at ?? null,
      reaction,
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
  return /^story\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/\d\.(jpg|png|webp|mp4|webm)$/.test(String(key ?? ''))
}
