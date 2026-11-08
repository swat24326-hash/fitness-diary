/**
 * Запросы группы АЗ (service role). Права — src/lib/chat/azGroupCore.js, здесь только чтение и запись.
 * Ключ участника в reads — u:<uuid> | c:<uuid>.
 */
import { isUniqueViolation } from '../../../src/lib/chat/chatDeliveryCore.js'
import { chronological } from '../../../src/lib/chat/chatMessageCore.js'
import { parseAzGroupParticipant } from '../../../src/lib/chat/azGroupCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { ATTACH_FIELDS, attachColumns } from './chatAttachStore.js'
import { CHAT_PAGE, voiceColumns } from './chatStore.js'

const THREAD_FIELDS =
  'id, instructor_user_id, club_id, last_message_at, last_author_side, last_author_user_id, last_author_client_id, last_preview'
export const AZ_MESSAGE_FIELDS =
  'id, body, sticker, created_at, author_side, author_user_id, author_client_id, reply_to, voice_key, voice_sec, voice_wave, voice_text, voice_played_at, voice_once, ' +
  ATTACH_FIELDS
const READ_FIELDS = 'thread_id, participant, read_at, muted'
const LINK_FIELDS = 'client_id, instructor_id, club_id'
/** Больше не считаем: в кружке всё равно «99+». */
const UNREAD_COUNT_MAX = 100

export function isMissingAzGroupTable(e) {
  const msg = String(e?.message ?? '')
  const code = String(e?.code ?? '')
  if (code === '42P01' || code === 'PGRST205') return true
  return /az_group_/.test(msg) && /does not exist|relation|schema cache/i.test(msg)
}

export async function loadAzInstructor(db, userId) {
  const { data, error } = await db.from('users').select('id, name, club_id').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ?? null
}

export function loadAzLinks(db, instructorUserId) {
  return rows(db.from('client_az_instructors').select(LINK_FIELDS).eq('instructor_id', instructorUserId))
}

export function loadAzLinksForClient(db, clientId) {
  return rows(db.from('client_az_instructors').select(LINK_FIELDS).eq('client_id', clientId))
}

export function loadAzLinksForInstructors(db, instructorIds) {
  const ids = [...new Set(instructorIds.filter((id) => isInboxUuid(id)).map((id) => String(id).toLowerCase()))]
  return loadInChunks(ids, (part) => rows(db.from('client_az_instructors').select(LINK_FIELDS).in('instructor_id', part)))
}

export async function loadClientNames(db, ids) {
  const unique = [...new Set(ids.filter((id) => isInboxUuid(id)).map((id) => String(id).toLowerCase()))]
  if (!unique.length) return new Map()
  const list = await loadInChunks(unique, (part) => rows(db.from('clients').select('id, name').in('id', part)))
  return new Map(list.map((c) => [String(c.id).toLowerCase(), String(c.name ?? '').trim()]))
}

export async function loadAzGroupThread(db, instructorUserId) {
  const { data, error } = await db.from('az_group_threads').select(THREAD_FIELDS).eq('instructor_user_id', instructorUserId).maybeSingle()
  if (error) throw error
  return data ?? null
}

export function loadAzGroupThreads(db, instructorIds) {
  const ids = [...new Set(instructorIds.filter((id) => isInboxUuid(id)).map((id) => String(id).toLowerCase()))]
  return loadInChunks(ids, (part) => rows(db.from('az_group_threads').select(THREAD_FIELDS).in('instructor_user_id', part)))
}

/** Чат создаётся первым сообщением; гонку двух первых разрешает UNIQUE (instructor_user_id). */
export async function ensureAzGroupThread(db, instructorUserId, clubId) {
  const found = await loadAzGroupThread(db, instructorUserId)
  if (found) return found
  const { data, error } = await db
    .from('az_group_threads')
    .insert({ instructor_user_id: instructorUserId, club_id: clubId })
    .select(THREAD_FIELDS)
    .single()
  if (!error) return data
  const again = await loadAzGroupThread(db, instructorUserId)
  if (again) return again
  throw error
}

export async function loadAzGroupRead(db, threadId, participant) {
  const { data, error } = await db.from('az_group_reads').select(READ_FIELDS).eq('thread_id', threadId).eq('participant', participant).maybeSingle()
  if (error) throw error
  return data ?? null
}

export function loadAzGroupReads(db, threadId) {
  return rows(db.from('az_group_reads').select(READ_FIELDS).eq('thread_id', threadId))
}

export function loadAzReadsForParticipant(db, threadIds, participant) {
  return loadInChunks([...new Set(threadIds.map(String))], (part) =>
    rows(db.from('az_group_reads').select(READ_FIELDS).eq('participant', participant).in('thread_id', part)),
  )
}

export async function saveAzGroupRead(db, threadId, participant, patch) {
  await rows(
    db.from('az_group_reads').upsert({ thread_id: threadId, participant, ...patch }, { onConflict: 'thread_id,participant' }).select('participant'),
  )
}

/** Сколько чужих сообщений после read_at (не больше UNREAD_COUNT_MAX). */
export async function countAzGroupUnread(db, threadId, viewerKey, readAt) {
  const who = parseAzGroupParticipant(viewerKey)
  if (!who || !isInboxUuid(who.id)) return 0
  let q = db.from('az_group_messages').select('id').eq('thread_id', threadId)
  if (readAt) q = q.gt('created_at', readAt)
  const others = who.side === 'user' ? `author_side.eq.client,author_user_id.neq.${who.id}` : `author_side.eq.user,author_client_id.neq.${who.id}`
  return (await rows(q.or(others).limit(UNREAD_COUNT_MAX))).length
}

export async function loadAzGroupMessages(db, threadId, before) {
  let q = db.from('az_group_messages').select(AZ_MESSAGE_FIELDS).eq('thread_id', threadId)
  if (before) q = q.lt('created_at', before)
  const desc = await rows(q.order('created_at', { ascending: false }).limit(CHAT_PAGE))
  return { messages: chronological(desc), has_more: desc.length === CHAT_PAGE }
}

export async function loadAzGroupMessageByClientMsgId(db, threadId, clientMsgId) {
  if (!clientMsgId) return null
  const { data, error } = await db
    .from('az_group_messages')
    .select(AZ_MESSAGE_FIELDS)
    .eq('thread_id', threadId)
    .eq('client_msg_id', clientMsgId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function loadAzGroupMessageById(db, threadId, messageId) {
  if (!isInboxUuid(messageId)) return null
  const { data, error } = await db.from('az_group_messages').select(AZ_MESSAGE_FIELDS).eq('thread_id', threadId).eq('id', messageId).maybeSingle()
  if (error) throw error
  return data ?? null
}

const isMissingPinColumn = (e) => /pinned_/.test(String(e?.message ?? '')) && /does not exist|column/i.test(String(e?.message ?? ''))

export async function loadAzGroupPin(db, threadId) {
  const { data, error } = await db.from('az_group_threads').select('pinned_message_id, pinned_at').eq('id', threadId).maybeSingle()
  if (error) {
    if (isMissingPinColumn(error)) return null
    throw error
  }
  if (!data?.pinned_message_id) return null
  const message = await loadAzGroupMessageById(db, threadId, data.pinned_message_id)
  return message ? { message, pinned_at: data.pinned_at } : null
}

/** messageId null — открепить. pinned_by — только пользователь (инструктор). */
export async function saveAzGroupPin(db, threadId, messageId, byUserId) {
  const patch = messageId
    ? { pinned_message_id: messageId, pinned_by: byUserId, pinned_at: new Date().toISOString() }
    : { pinned_message_id: null, pinned_by: null, pinned_at: null }
  const { error } = await db.from('az_group_threads').update(patch).eq('id', threadId)
  if (error) throw error
}

export async function countRecentAzGroupMessages(db, threadId, viewer, since, limit) {
  let q = db.from('az_group_messages').select('id').eq('thread_id', threadId).gte('created_at', since)
  q = viewer.kind === 'client' ? q.eq('author_side', 'client').eq('author_client_id', viewer.clientId) : q.eq('author_side', 'user').eq('author_user_id', viewer.userId)
  return (await rows(q.limit(limit))).length
}

/**
 * Последнее сообщение и «прочитано» автора обновляет триггер базы.
 * @returns {Promise<{ message: object, duplicate: boolean }>}
 */
export async function insertAzGroupMessage(db, thread, { viewer, body, sticker = null, clientMsgId = null, replyTo = null, voice = null, attach = null }) {
  const client = viewer.kind === 'client'
  const { data, error } = await db
    .from('az_group_messages')
    .insert({
      thread_id: thread.id,
      author_side: client ? 'client' : 'user',
      author_user_id: client ? null : viewer.userId,
      author_client_id: client ? viewer.clientId : null,
      body,
      sticker,
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...voiceColumns(voice),
      ...attachColumns(attach),
    })
    .select(AZ_MESSAGE_FIELDS)
    .single()
  if (error) {
    const existing = isUniqueViolation(error) ? await loadAzGroupMessageByClientMsgId(db, thread.id, clientMsgId) : null
    if (existing) return { message: existing, duplicate: true }
    throw error
  }
  return { message: data, duplicate: false }
}
