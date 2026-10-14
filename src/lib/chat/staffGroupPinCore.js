/**
 * Чат клуба, как в группах Telegram: закреплённое сообщение сверху ленты и «Кто прочитал» у своего сообщения.
 * Без React и базы — сервер и подменный сервер автотестов зовут одно и то же.
 */
import { pluralRu } from '../client/clientMeUiCore.js'
import { buildChatReplyQuote } from './chatReplyCore.js'
import { staffDmRoleOf } from './staffDmAccessCore.js'

export const STAFF_GROUP_PIN_DENIED_RU = 'Закреплять может управляющий клуба'
export const STAFF_GROUP_PIN_GONE_RU = 'Сообщение не нашлось — возможно, оно удалено'
export const STAFF_GROUP_READERS_DENIED_RU = 'Кто прочитал — видно только у своих сообщений'
export const STAFF_GROUP_PINNED_TITLE_RU = 'Закреплённое сообщение'

const norm = (v) => String(v ?? '').trim()
const ms = (v) => Date.parse(String(v ?? ''))
const collator = new Intl.Collator('ru', { sensitivity: 'base' })

/** Закреп — у управляющего клуба (и связанного с ним тренера — он в чате от учётки управляющего) и главного админа. */
export function canPinStaffGroup(viewer) {
  const role = staffDmRoleOf(viewer?.role)
  return role === 'supervisor' || role === 'admin'
}

/**
 * Полоса над лентой: текст как у цитаты («Стикер», превью до 100 знаков). Сообщения нет — полосы нет.
 * @param {object|null} messageView buildStaffGroupMessageView
 */
export function buildStaffGroupPinned(messageView, pinnedAt) {
  const quote = buildChatReplyQuote(messageView)
  return quote ? { id: quote.id, text: quote.text, sticker: quote.sticker, pinned_at: pinnedAt ?? null } : null
}

/** Открыл ли человек чат после сообщения: его «прочитано» не раньше времени сообщения. */
const hasRead = (read, message) => Boolean(read?.read_at) && ms(read.read_at) >= ms(message?.created_at)

/** Кому видно сообщение: участники без автора. */
const othersOf = (message, members) => (members ?? []).filter((u) => norm(u.id) !== norm(message?.author_user_id))

/**
 * «Прочитали 3 из 5» у своего сообщения: участники чата, кроме автора. Главный админ не участник —
 * его просмотр «для контроля» не считается (как в переписке с клиентом).
 * @returns {{ seen: number, total: number }}
 */
export function staffGroupSeenCount(message, members, reads) {
  const readOf = new Map((reads ?? []).map((r) => [norm(r.user_id), r]))
  const others = othersOf(message, members)
  return { seen: others.filter((u) => hasRead(readOf.get(norm(u.id)), message)).length, total: others.length }
}

/**
 * Списки для окна «Кто прочитал»: по алфавиту, имя — как в ленте (связанный управляющий под ФИО из тренерской).
 * @param {Map<string, string>} names id → имя
 * @returns {{ read: Array<{ id: string, name: string }>, unread: Array<{ id: string, name: string }> }}
 */
export function staffGroupReaders(message, members, reads, names) {
  const readOf = new Map((reads ?? []).map((r) => [norm(r.user_id), r]))
  const person = (u) => ({ id: norm(u.id), name: names?.get(norm(u.id)) || norm(u.name) || 'Сотрудник' })
  const byName = (a, b) => collator.compare(a.name, b.name)
  const read = []
  const unread = []
  for (const u of othersOf(message, members)) (hasRead(readOf.get(norm(u.id)), message) ? read : unread).push(person(u))
  return { read: read.sort(byName), unread: unread.sort(byName) }
}

/** Пункт меню у своего сообщения. */
export function staffGroupSeenRu({ seen, total }) {
  if (!total) return 'В чате пока никого нет'
  if (!seen) return 'Пока никто не прочитал'
  if (seen >= total) return total === 1 ? 'Прочитано' : `Прочитали все ${total}`
  return `${pluralRu(seen, 'Прочитал', 'Прочитали', 'Прочитали')} ${seen} из ${total}`
}
