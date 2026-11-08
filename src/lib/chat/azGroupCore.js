/**
 * Группа АЗ — общий чат инструктора со всеми подопечными из client_az_instructors.
 * Участников не храним. Авторы смешанные (user | client). Без React и базы.
 */
import { pluralRu } from '../client/clientMeUiCore.js'
import { CHAT_PUSH_PREVIEW_MAX, chatPreview } from './chatMessageCore.js'
import { buildAttachView } from './chatAttachCore.js'
import { buildVoiceView } from './chatVoiceCore.js'

export const AZ_GROUP_TITLE_RU = 'Группа АЗ'
export const AZ_GROUP_EMPTY_RU = 'Общий чат инструктора и подопечных'
export const AZ_GROUP_NO_ACCESS_RU = 'Нет доступа к группе АЗ'
export const AZ_GROUP_UNAVAILABLE_RU = 'Группа АЗ пока недоступна — попробуйте позже'
export const AZ_GROUP_NO_MEMBERS_RU = 'Пока нет подопечных АЗ'

const norm = (v) => String(v ?? '').trim()
const lower = (v) => norm(v).toLowerCase()
const ms = (v) => Date.parse(String(v ?? ''))
const later = (a, b) => ms(a) > ms(b)

/** Ключ участника в reads / reactions: u:<uuid> | c:<uuid>. */
export function azGroupParticipantKey({ side, userId, clientId } = {}) {
  if (side === 'user' || (!side && userId)) {
    const id = lower(userId)
    return id ? `u:${id}` : ''
  }
  if (side === 'client' || (!side && clientId)) {
    const id = lower(clientId)
    return id ? `c:${id}` : ''
  }
  return ''
}

export function parseAzGroupParticipant(key) {
  const s = lower(key)
  if (s.startsWith('u:') && s.length > 2) return { side: 'user', id: s.slice(2) }
  if (s.startsWith('c:') && s.length > 2) return { side: 'client', id: s.slice(2) }
  return null
}

/**
 * Доступ к треду.
 * @param {{ kind: 'instructor'|'client', userId?: string, clientId?: string }} viewer
 * @param {{ instructorUserId: string, clientIds?: Iterable<string> }} thread
 */
export function azGroupAccess(viewer, thread) {
  const instructorId = lower(thread?.instructorUserId)
  if (!instructorId) return { ok: false, status: 404, error: AZ_GROUP_UNAVAILABLE_RU }
  if (viewer?.kind === 'instructor') {
    if (lower(viewer.userId) === instructorId) return { ok: true, instructorUserId: instructorId }
    return { ok: false, status: 403, error: AZ_GROUP_NO_ACCESS_RU }
  }
  if (viewer?.kind === 'client') {
    const cid = lower(viewer.clientId)
    const allowed = new Set([...(thread?.clientIds ?? [])].map(lower))
    if (cid && allowed.has(cid)) return { ok: true, instructorUserId: instructorId }
    return { ok: false, status: 403, error: AZ_GROUP_NO_ACCESS_RU }
  }
  return { ok: false, status: 403, error: AZ_GROUP_NO_ACCESS_RU }
}

/**
 * Состав: инструктор + уникальные клиенты по ссылкам этого инструктора.
 * @param {{ instructorId: string, instructorName?: string, links?: Array<{ instructor_id?: string, client_id?: string }>, clients?: Array<{ id: string, full_name?: string, name?: string }> }} p
 * @returns {Array<{ id: string, side: 'user'|'client', name: string }>}
 */
export function pickAzGroupMembers({ instructorId, instructorName = '', links = [], clients = [] } = {}) {
  const iid = lower(instructorId)
  if (!iid) return []
  const nameByClient = new Map(
    (clients ?? []).map((c) => [lower(c.id), norm(c.full_name || c.name) || 'Клиент']),
  )
  const out = [{ id: iid, side: 'user', name: norm(instructorName) || 'Инструктор' }]
  const seen = new Set([iid])
  for (const link of links ?? []) {
    if (lower(link?.instructor_id) !== iid) continue
    const cid = lower(link?.client_id)
    if (!cid || seen.has(`c:${cid}`)) continue
    seen.add(`c:${cid}`)
    out.push({ id: cid, side: 'client', name: nameByClient.get(cid) || 'Клиент' })
  }
  return out
}

export function azGroupMemberIds(members) {
  return (members ?? []).map((m) => azGroupParticipantKey({ side: m.side, userId: m.id, clientId: m.id }))
}

/** Сообщение для ленты: у чужих — имя автора. */
export function buildAzGroupMessageView(m, viewer) {
  const authorKey =
    m?.author_side === 'client'
      ? azGroupParticipantKey({ side: 'client', clientId: m.author_client_id })
      : azGroupParticipantKey({ side: 'user', userId: m.author_user_id })
  const viewerKey =
    viewer?.kind === 'client'
      ? azGroupParticipantKey({ side: 'client', clientId: viewer.clientId })
      : azGroupParticipantKey({ side: 'user', userId: viewer?.userId })
  const mine = Boolean(authorKey && viewerKey && authorKey === viewerKey)
  return {
    id: String(m.id),
    body: m.body,
    sticker: m.sticker ?? null,
    voice: buildVoiceView(m),
    attach: buildAttachView(m),
    created_at: m.created_at,
    side: mine ? 'staff' : 'client',
    mine,
    author_side: m.author_side === 'client' ? 'client' : 'user',
    author_name: mine ? '' : norm(m.author_name) || (m.author_side === 'client' ? 'Клиент' : 'Инструктор'),
  }
}

export function isAzGroupUnread(thread, read, viewerKey) {
  if (!thread?.last_message_at) return false
  const lastKey =
    thread.last_author_side === 'client'
      ? azGroupParticipantKey({ side: 'client', clientId: thread.last_author_client_id })
      : azGroupParticipantKey({ side: 'user', userId: thread.last_author_user_id })
  if (lastKey && lastKey === lower(viewerKey)) return false
  return !read?.read_at || later(thread.last_message_at, read.read_at)
}

export function azGroupReadAt(read, lastShownAt) {
  if (!lastShownAt || Number.isNaN(ms(lastShownAt))) return null
  return !read?.read_at || later(lastShownAt, read.read_at) ? String(lastShownAt) : null
}

/** ✓✓ — кто-то из других открыл после сообщения. reads: { participant, read_at }. */
export function azGroupPeerReadAt(reads, viewerKey, memberKeys = null) {
  const members = memberKeys ? new Set([...memberKeys].map(lower)) : null
  const me = lower(viewerKey)
  let max = null
  for (const r of reads ?? []) {
    const p = lower(r.participant)
    if (!p || p === me || !r.read_at || (members && !members.has(p))) continue
    if (!max || later(r.read_at, max)) max = String(r.read_at)
  }
  return max
}

/**
 * Строка в списке.
 * @param {{ instructorUserId: string, instructorName?: string, members: number, thread: object|null, read: object|null, unreadCount: number, viewerKey: string, lastAuthorName?: string }} p
 */
export function azGroupSummary({
  instructorUserId,
  instructorName = '',
  members,
  thread,
  read,
  unreadCount,
  viewerKey,
  lastAuthorName = '',
} = {}) {
  const unread = isAzGroupUnread(thread, read, viewerKey)
  const lastMine =
    thread?.last_author_side === 'client'
      ? azGroupParticipantKey({ side: 'client', clientId: thread.last_author_client_id }) === lower(viewerKey)
      : azGroupParticipantKey({ side: 'user', userId: thread?.last_author_user_id }) === lower(viewerKey)
  return {
    instructor_user_id: lower(instructorUserId),
    name: norm(instructorName) ? `${AZ_GROUP_TITLE_RU} · ${norm(instructorName)}` : AZ_GROUP_TITLE_RU,
    members: Number(members) || 0,
    last_preview: String(thread?.last_preview ?? ''),
    last_message_at: thread?.last_message_at ?? null,
    last_author: thread?.last_message_at ? (lastMine ? 'staff' : 'client') : null,
    last_author_name: norm(lastAuthorName),
    unread,
    unread_count: unread ? Math.max(1, Number(unreadCount) || 0) : 0,
    muted: read?.muted === true,
  }
}

export function azGroupPreviewRu(g) {
  const text = norm(g?.last_preview)
  if (!text) return AZ_GROUP_EMPTY_RU
  if (g.last_author === 'staff') return `Вы: ${text}`
  const who = norm(g.last_author_name)
  return who ? `${who}: ${text}` : text
}

export function azGroupAttention(summary) {
  return summary?.unread && !summary.muted ? 1 : 0
}

export function azGroupMembersRu(n) {
  const v = Number(n) || 0
  return `${v} ${pluralRu(v, 'участник', 'участника', 'участников')}`
}

/** Push: участники без автора и без mute. keys = participant strings. */
export function azGroupPushRecipients(memberKeys, mutedKeys, authorKey) {
  const muted = new Set([...(mutedKeys ?? [])].map(lower))
  const author = lower(authorKey)
  return [...new Set([...(memberKeys ?? [])].map(lower))].filter((id) => id && id !== author && !muted.has(id))
}

export function azGroupInstructorHref(instructorUserId) {
  return `/messages?azGroup=${encodeURIComponent(lower(instructorUserId))}`
}

export function azGroupCoachHref() {
  return '/coach/az-group'
}

export function azGroupClientHref(instructorUserId) {
  return `/me/az-group/${encodeURIComponent(lower(instructorUserId))}`
}

/**
 * Push инструктору (staff/coach) или клиенту (/me).
 * @param {{ instructorUserId: string, title?: string, authorName: string, body: string, forClient?: boolean, silent?: boolean }} p
 */
export function buildAzGroupPushPayload({
  instructorUserId,
  title = '',
  authorName,
  body,
  forClient = false,
  silent = false,
} = {}) {
  const who = norm(authorName)
  const text = chatPreview(body, CHAT_PUSH_PREVIEW_MAX)
  const id = lower(instructorUserId)
  return {
    title: norm(title) || AZ_GROUP_TITLE_RU,
    body: who ? `${who}: ${text}` : text,
    url: forClient ? azGroupClientHref(id) : azGroupInstructorHref(id),
    tag: `az-group-${id}`,
    ...(silent ? { silent: true } : {}),
  }
}
