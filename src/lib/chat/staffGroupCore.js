/**
 * Чат клуба — общий чат сотрудников одного клуба. Участников не храним: это активные тренеры, менеджеры
 * и управляющий клуба (уволили / перевели — сразу вне чата). Главный админ — в чатах всех клубов.
 * «Прочитано» и «без звука» у каждого свои. Без React и базы — сервер и подменный сервер автотестов зовут одно и то же.
 */
import { pluralRu } from '../client/clientMeUiCore.js'
import { CHAT_PUSH_PREVIEW_MAX, chatPreview } from './chatMessageCore.js'
import { buildAttachView } from './chatAttachCore.js'
import { buildVoiceView } from './chatVoiceCore.js'
import { STAFF_DM_NO_ACCESS_RU, STAFF_DM_NO_CLUB_RU, staffDmRoleOf } from './staffDmAccessCore.js'

export const STAFF_GROUP_TITLE_RU = 'Чат клуба'
export const STAFF_GROUP_NO_ACCESS_RU = STAFF_DM_NO_ACCESS_RU
export const STAFF_GROUP_NO_CLUB_RU = STAFF_DM_NO_CLUB_RU
export const STAFF_GROUP_PICK_CLUB_RU = 'Не выбран клуб'
export const STAFF_GROUP_UNAVAILABLE_RU = 'Чат клуба пока недоступен — попробуйте позже'
export const STAFF_GROUP_EMPTY_RU = 'Общий чат сотрудников клуба'

const MEMBER_ROLES = new Set(['trainer', 'sales', 'supervisor'])
const norm = (v) => String(v ?? '').trim()
const ms = (v) => Date.parse(String(v ?? ''))
/** Время из базы может прийти в разном виде («…Z», «…+00:00») — сравниваем как время, не как строку. */
const later = (a, b) => ms(a) > ms(b)

/**
 * Чей чат открыть. Сотрудник — только своего клуба (club_id можно не передавать); главный админ — любого, клуб обязателен.
 * @param {{ role: string, club_id?: string|null }} viewer
 * @returns {{ ok: true, clubId: string } | { ok: false, status: number, error: string }}
 */
export function staffGroupClubFor(viewer, requestedClubId) {
  const role = staffDmRoleOf(viewer?.role)
  if (!role) return { ok: false, status: 403, error: STAFF_GROUP_NO_ACCESS_RU }
  const requested = norm(requestedClubId)
  if (role === 'admin') return requested ? { ok: true, clubId: requested } : { ok: false, status: 400, error: STAFF_GROUP_PICK_CLUB_RU }
  const own = norm(viewer.club_id)
  if (!own) return { ok: false, status: 403, error: STAFF_GROUP_NO_CLUB_RU }
  if (requested && requested !== own) return { ok: false, status: 403, error: STAFF_GROUP_NO_ACCESS_RU }
  return { ok: true, clubId: own }
}

/**
 * Участники чата: активные тренеры, менеджеры и управляющие клуба. Тренерская учётка связанного управляющего —
 * не второй человек (hiddenIds из linkedStaffCore).
 * @param {Array<{ id: string, role: string, club_id?: string|null, is_active?: boolean }>} users
 */
export function pickStaffGroupMembers(users, clubId, hiddenIds = new Set()) {
  return (users ?? []).filter(
    (u) => u.is_active !== false && norm(u.club_id) === norm(clubId) && MEMBER_ROLES.has(staffDmRoleOf(u.role)) && !hiddenIds.has(norm(u.id)),
  )
}

/** Сообщение для ленты: у чужих — имя автора (в группе без него не понять, кто пишет). */
export function buildStaffGroupMessageView(m, viewerId, names) {
  const mine = norm(m.author_user_id) === norm(viewerId)
  return {
    id: String(m.id),
    body: m.body,
    sticker: m.sticker ?? null,
    voice: buildVoiceView(m),
    attach: buildAttachView(m),
    created_at: m.created_at,
    side: mine ? 'staff' : 'client',
    mine,
    author_name: mine ? '' : names?.get(norm(m.author_user_id)) || 'Сотрудник',
  }
}

/** Есть новое от других после последнего показанного. */
export function isStaffGroupUnread(thread, read, viewerId) {
  if (!thread?.last_message_at || norm(thread.last_author) === norm(viewerId)) return false
  return !read?.read_at || later(thread.last_message_at, read.read_at)
}

/**
 * Новое «прочитано»: время последнего показанного сообщения, если оно позже прежнего. Иначе null — не писать.
 * Время сообщения, а не «сейчас»: пришедшее во время запроса останется непрочитанным.
 */
export function staffGroupReadAt(read, lastShownAt) {
  if (!lastShownAt || Number.isNaN(ms(lastShownAt))) return null
  return !read?.read_at || later(lastShownAt, read.read_at) ? String(lastShownAt) : null
}

/**
 * ✓✓ у своего сообщения — кто-то из других открыл чат после него (как в группах Telegram).
 * memberIds — только участники: просмотр главного админа «для контроля» ✓✓ не ставит.
 */
export function staffGroupPeerReadAt(reads, viewerId, memberIds = null) {
  const members = memberIds ? new Set([...memberIds].map(norm)) : null
  let max = null
  for (const r of reads ?? []) {
    if (norm(r.user_id) === norm(viewerId) || !r.read_at || (members && !members.has(norm(r.user_id)))) continue
    if (!max || later(r.read_at, max)) max = String(r.read_at)
  }
  return max
}

/**
 * Строка чата в списке.
 * @param {{ clubId: string, name: string, members: number, thread: object|null, read: object|null, unreadCount: number, viewerId: string, lastAuthorName?: string }} p
 */
export function staffGroupSummary({ clubId, name, members, thread, read, unreadCount, viewerId, lastAuthorName = '' }) {
  const unread = isStaffGroupUnread(thread, read, viewerId)
  return {
    club_id: norm(clubId),
    name: norm(name) || STAFF_GROUP_TITLE_RU,
    members: Number(members) || 0,
    last_preview: String(thread?.last_preview ?? ''),
    last_message_at: thread?.last_message_at ?? null,
    last_author: thread?.last_author ? (norm(thread.last_author) === norm(viewerId) ? 'staff' : 'client') : null,
    last_author_name: norm(lastAuthorName),
    unread,
    unread_count: unread ? Math.max(1, Number(unreadCount) || 0) : 0,
    muted: read?.muted === true,
  }
}

/** «Вы: …», «Анна: …» или подпись пустого чата. */
export function staffGroupPreviewRu(g) {
  const text = norm(g?.last_preview)
  if (!text) return STAFF_GROUP_EMPTY_RU
  if (g.last_author === 'staff') return `Вы: ${text}`
  const who = norm(g.last_author_name)
  return who ? `${who}: ${text}` : text
}

/** В число на конверте — только незаглушённый чат с новым. */
export function staffGroupAttention(summary) {
  return summary?.unread && !summary.muted ? 1 : 0
}

/** Папка главного админа «Чаты клубов». */
export const STAFF_VIEW_GROUPS = 'groups'
export const STAFF_GROUPS_TITLE_RU = 'Чаты клубов'

const collator = new Intl.Collator('ru', { sensitivity: 'base' })

/** Чаты клубов у главного админа: с новым сверху, затем свежие, затем по названию. */
export function sortStaffGroups(groups) {
  return [...(groups ?? [])].sort(
    (a, b) =>
      Number(Boolean(b.unread)) - Number(Boolean(a.unread)) ||
      String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')) ||
      collator.compare(a.name || '', b.name || ''),
  )
}

/** Пункт папок слева: число — незаглушённые чаты с новым. */
export function staffGroupsRailItem(groups) {
  const list = groups ?? []
  return { key: STAFF_VIEW_GROUPS, title: STAFF_GROUPS_TITLE_RU, unread: list.filter((g) => staffGroupAttention(g)).length, total: list.length }
}

export function staffGroupMembersRu(n) {
  const v = Number(n) || 0
  return `${v} ${pluralRu(v, 'участник', 'участника', 'участников')}`
}

/** Кому push: участники без автора и без тех, кто заглушил чат. */
export function staffGroupPushRecipients(memberIds, mutedIds, authorId) {
  const muted = new Set([...(mutedIds ?? [])].map(norm))
  return [...new Set([...(memberIds ?? [])].map(norm))].filter((id) => id && id !== norm(authorId) && !muted.has(id))
}

export function staffGroupHref(clubId) {
  return `/messages?group=${encodeURIComponent(norm(clubId))}`
}

/** Push участнику: название клуба, «Имя: текст»; телефон тренера сам переведёт адрес в /coach/group (pushTargetUrlCore). */
export function buildStaffGroupPushPayload({ clubId, clubName, authorName, body, silent = false }) {
  const who = norm(authorName)
  const text = chatPreview(body, CHAT_PUSH_PREVIEW_MAX)
  return {
    title: norm(clubName) || STAFF_GROUP_TITLE_RU,
    body: who ? `${who}: ${text}` : text,
    url: staffGroupHref(clubId),
    tag: `group-${norm(clubId)}`,
    ...(silent ? { silent: true } : {}),
  }
}
