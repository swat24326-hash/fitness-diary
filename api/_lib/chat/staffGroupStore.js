/**
 * Запросы чата клуба (service role). Права — src/lib/chat/staffGroupCore.js, здесь только чтение и запись.
 */
import { isUniqueViolation } from '../../../src/lib/chat/chatDeliveryCore.js'
import { chronological } from '../../../src/lib/chat/chatMessageCore.js'
import { linkedPersonNames } from '../../../src/lib/chat/linkedStaffCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { CHAT_PAGE, voiceColumns } from './chatStore.js'
import { LINK_FIELDS, isMissingLinkColumn } from './linkedStaffStore.js'

const THREAD_FIELDS = 'id, club_id, last_message_at, last_author, last_preview'
export const GROUP_MESSAGE_FIELDS =
  'id, body, sticker, created_at, author_user_id, reply_to, voice_key, voice_sec, voice_wave, voice_text, voice_played_at, voice_once'
const READ_FIELDS = 'thread_id, user_id, read_at, muted'
/** Больше не считаем: в кружке всё равно «99+». */
const UNREAD_COUNT_MAX = 100

export function isMissingGroupTable(e) {
  const msg = String(e?.message ?? '')
  return /staff_group_/.test(msg) && /does not exist|relation/i.test(msg)
}

export async function loadClubName(db, clubId) {
  const { data, error } = await db.from('clubs').select('id, name').eq('id', clubId).maybeSingle()
  if (error) throw error
  return data ? String(data.name ?? '').trim() : null
}

export function loadClubs(db) {
  return rows(db.from('clubs').select('id, name, is_active'))
}

export async function loadGroupThread(db, clubId) {
  const { data, error } = await db.from('staff_group_threads').select(THREAD_FIELDS).eq('club_id', clubId).maybeSingle()
  if (error) throw error
  return data ?? null
}

export function loadGroupThreads(db, clubIds) {
  const ids = [...new Set(clubIds.map(String))]
  return loadInChunks(ids, (part) => rows(db.from('staff_group_threads').select(THREAD_FIELDS).in('club_id', part)))
}

/** Чат создаётся первым сообщением; гонку двух первых разрешает UNIQUE (club_id). */
export async function ensureGroupThread(db, clubId) {
  const found = await loadGroupThread(db, clubId)
  if (found) return found
  const { data, error } = await db.from('staff_group_threads').insert({ club_id: clubId }).select(THREAD_FIELDS).single()
  if (!error) return data
  const again = await loadGroupThread(db, clubId)
  if (again) return again
  throw error
}

export async function loadGroupRead(db, threadId, userId) {
  const { data, error } = await db.from('staff_group_reads').select(READ_FIELDS).eq('thread_id', threadId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ?? null
}

export function loadGroupReads(db, threadId) {
  return rows(db.from('staff_group_reads').select(READ_FIELDS).eq('thread_id', threadId))
}

/** Отметки одного человека во многих чатах (главный админ — все клубы). */
export function loadUserGroupReads(db, threadIds, userId) {
  return loadInChunks([...new Set(threadIds.map(String))], (part) =>
    rows(db.from('staff_group_reads').select(READ_FIELDS).eq('user_id', userId).in('thread_id', part)),
  )
}

export async function saveGroupRead(db, threadId, userId, patch) {
  await rows(db.from('staff_group_reads').upsert({ thread_id: threadId, user_id: userId, ...patch }, { onConflict: 'thread_id,user_id' }).select('user_id'))
}

/** Сколько сообщений других после read_at (не больше UNREAD_COUNT_MAX). */
export async function countGroupUnread(db, threadId, userId, readAt) {
  let q = db.from('staff_group_messages').select('id').eq('thread_id', threadId).neq('author_user_id', userId)
  if (readAt) q = q.gt('created_at', readAt)
  return (await rows(q.limit(UNREAD_COUNT_MAX))).length
}

export async function loadGroupMessages(db, threadId, before) {
  let q = db.from('staff_group_messages').select(GROUP_MESSAGE_FIELDS).eq('thread_id', threadId)
  if (before) q = q.lt('created_at', before)
  const desc = await rows(q.order('created_at', { ascending: false }).limit(CHAT_PAGE))
  return { messages: chronological(desc), has_more: desc.length === CHAT_PAGE }
}

export async function loadGroupMessageByClientMsgId(db, threadId, clientMsgId) {
  if (!clientMsgId) return null
  const { data, error } = await db
    .from('staff_group_messages')
    .select(GROUP_MESSAGE_FIELDS)
    .eq('thread_id', threadId)
    .eq('client_msg_id', clientMsgId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function loadGroupMessageById(db, threadId, messageId) {
  if (!isInboxUuid(messageId)) return null
  const { data, error } = await db.from('staff_group_messages').select(GROUP_MESSAGE_FIELDS).eq('thread_id', threadId).eq('id', messageId).maybeSingle()
  if (error) throw error
  return data ?? null
}

/** Колонок закрепа ещё нет (миграция 20261028120000 не применена) — чат работает без полосы. */
const isMissingPinColumn = (e) => /pinned_/.test(String(e?.message ?? '')) && /does not exist|column/i.test(String(e?.message ?? ''))

/** Закреплённое сообщение чата или null. */
export async function loadGroupPin(db, threadId) {
  const { data, error } = await db.from('staff_group_threads').select('pinned_message_id, pinned_at').eq('id', threadId).maybeSingle()
  if (error) {
    if (isMissingPinColumn(error)) return null
    throw error
  }
  if (!data?.pinned_message_id) return null
  const message = await loadGroupMessageById(db, threadId, data.pinned_message_id)
  return message ? { message, pinned_at: data.pinned_at } : null
}

/** messageId null — открепить. */
export async function saveGroupPin(db, threadId, messageId, byUserId) {
  const patch = messageId
    ? { pinned_message_id: messageId, pinned_by: byUserId, pinned_at: new Date().toISOString() }
    : { pinned_message_id: null, pinned_by: null, pinned_at: null }
  const { error } = await db.from('staff_group_threads').update(patch).eq('id', threadId)
  if (error) throw error
}

export async function countRecentGroupMessages(db, threadId, authorId, since, limit) {
  const q = db.from('staff_group_messages').select('id').eq('thread_id', threadId).eq('author_user_id', authorId).gte('created_at', since)
  return (await rows(q.limit(limit))).length
}

/**
 * Последнее сообщение чата и «прочитано» автора обновляет триггер базы (миграция 20261027120000).
 * @returns {Promise<{ message: object, duplicate: boolean }>}
 */
export async function insertGroupMessage(db, thread, { authorId, body, sticker = null, clientMsgId = null, replyTo = null, voice = null }) {
  const { data, error } = await db
    .from('staff_group_messages')
    .insert({
      thread_id: thread.id,
      author_user_id: authorId,
      body,
      sticker,
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...voiceColumns(voice),
    })
    .select(GROUP_MESSAGE_FIELDS)
    .single()
  if (error) {
    const existing = isUniqueViolation(error) ? await loadGroupMessageByClientMsgId(db, thread.id, clientMsgId) : null
    if (existing) return { message: existing, duplicate: true }
    throw error
  }
  return { message: data, duplicate: false }
}

async function loadUsersWithLinks(db, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return []
  try {
    return await loadInChunks(unique, (part) => rows(db.from('users').select(LINK_FIELDS).in('id', part)))
  } catch (e) {
    if (!isMissingLinkColumn(e)) throw e
    return loadInChunks(unique, (part) => rows(db.from('users').select('id, name, role, club_id, is_active').in('id', part)))
  }
}

/** id автора → имя; у управляющего, связанного с тренерской учёткой, — ФИО из неё. */
export async function loadAuthorNames(db, authorIds) {
  const users = await loadUsersWithLinks(db, authorIds)
  const linked = await loadUsersWithLinks(
    db,
    users.map((u) => u.linked_user_id).filter((id) => id && !users.some((u) => String(u.id) === String(id))),
  )
  const person = linkedPersonNames([...users, ...linked])
  return new Map(users.map((u) => [String(u.id), person.get(String(u.id)) ?? String(u.name ?? '').trim()]))
}
