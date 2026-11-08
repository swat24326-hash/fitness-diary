/**
 * Группа АЗ: закреп и «Кто прочитал». Закрепляет только инструктор этого чата.
 * Без React и базы.
 */
import { pluralRu } from '../client/clientMeUiCore.js'
import { buildChatReplyQuote } from './chatReplyCore.js'
import { azGroupParticipantKey } from './azGroupCore.js'

export const AZ_GROUP_PIN_DENIED_RU = 'Закреплять может только инструктор группы'
export const AZ_GROUP_PIN_GONE_RU = 'Сообщение не нашлось — возможно, оно удалено'
export const AZ_GROUP_READERS_DENIED_RU = 'Кто прочитал — видно только у своих сообщений'
export const AZ_GROUP_PINNED_TITLE_RU = 'Закреплённое сообщение'

const norm = (v) => String(v ?? '').trim()
const lower = (v) => norm(v).toLowerCase()
const ms = (v) => Date.parse(String(v ?? ''))
const collator = new Intl.Collator('ru', { sensitivity: 'base' })

/** Закреп — только инструктор этого треда (не клиент, не чужой тренер, не админ в волне 1). */
export function canPinAzGroup(viewer, instructorUserId) {
  if (viewer?.kind !== 'instructor') return false
  return lower(viewer.userId) === lower(instructorUserId) && Boolean(lower(instructorUserId))
}

export function buildAzGroupPinned(messageView, pinnedAt) {
  const quote = buildChatReplyQuote(messageView)
  return quote ? { id: quote.id, text: quote.text, sticker: quote.sticker, pinned_at: pinnedAt ?? null } : null
}

const memberKey = (m) => azGroupParticipantKey({ side: m.side, userId: m.id, clientId: m.id })

const hasRead = (read, message) => Boolean(read?.read_at) && ms(read.read_at) >= ms(message?.created_at)

const authorKeyOf = (message) =>
  message?.author_side === 'client'
    ? azGroupParticipantKey({ side: 'client', clientId: message.author_client_id })
    : azGroupParticipantKey({ side: 'user', userId: message.author_user_id })

const othersOf = (message, members) => {
  const author = authorKeyOf(message)
  return (members ?? []).filter((m) => memberKey(m) !== author)
}

/**
 * «Прочитали N из M» у своего: участники без автора.
 * @returns {{ seen: number, total: number }}
 */
export function azGroupSeenCount(message, members, reads) {
  const readOf = new Map((reads ?? []).map((r) => [lower(r.participant), r]))
  const others = othersOf(message, members)
  return { seen: others.filter((m) => hasRead(readOf.get(memberKey(m)), message)).length, total: others.length }
}

/**
 * Окно «Кто прочитал».
 * @returns {{ read: Array<{ id: string, side: string, name: string }>, unread: Array<{ id: string, side: string, name: string }> }}
 */
export function azGroupReaders(message, members, reads, names) {
  const readOf = new Map((reads ?? []).map((r) => [lower(r.participant), r]))
  const person = (m) => ({
    id: lower(m.id),
    side: m.side === 'client' ? 'client' : 'user',
    name: names?.get(memberKey(m)) || names?.get(lower(m.id)) || norm(m.name) || (m.side === 'client' ? 'Клиент' : 'Инструктор'),
  })
  const byName = (a, b) => collator.compare(a.name, b.name)
  const read = []
  const unread = []
  for (const m of othersOf(message, members)) (hasRead(readOf.get(memberKey(m)), message) ? read : unread).push(person(m))
  return { read: read.sort(byName), unread: unread.sort(byName) }
}

export function azGroupSeenRu({ seen, total }) {
  if (!total) return 'В чате пока никого нет'
  if (!seen) return 'Пока никто не прочитал'
  if (seen >= total) return total === 1 ? 'Прочитано' : `Прочитали все ${total}`
  return `${pluralRu(seen, 'Прочитал', 'Прочитали', 'Прочитали')} ${seen} из ${total}`
}
