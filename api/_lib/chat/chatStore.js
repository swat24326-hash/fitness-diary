/**
 * Запросы переписки (service role). Правила доступа — в src/lib/chat/chatAccessCore.js, здесь только чтение и запись.
 */
import { chatPreview, chronological } from '../../../src/lib/chat/chatMessageCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'

export const CHAT_PAGE = 60
export const CHAT_LIST_LIMIT = 100
const THREAD_FIELDS =
  'id, club_id, client_id, kind, last_message_at, last_author, last_preview, client_read_at, staff_read_at, client_unread, staff_unread'
const MESSAGE_FIELDS = 'id, body, sticker, created_at, author_side, author_user_id'

export function isMissingChatTable(e) {
  const msg = String(e?.message ?? '')
  return /chat_(threads|messages)/.test(msg) && /does not exist|relation/i.test(msg)
}

export async function loadChatClient(db, clientId) {
  const { data, error } = await db
    .from('clients')
    .select('id, name, club_id, trainer_id, archived_at')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function loadChatThread(db, clientId, kind) {
  const { data, error } = await db.from('chat_threads').select(THREAD_FIELDS).eq('client_id', clientId).eq('kind', kind).maybeSingle()
  if (error) throw error
  return data ?? null
}

export function loadClientThreads(db, clientId) {
  return rows(db.from('chat_threads').select(THREAD_FIELDS).eq('client_id', clientId))
}

/**
 * Кандидаты для списка сотрудника; окончательный фильтр — canStaffReadChat по строке клиента.
 * @param {{ role: string, userId: string, clubId: string, kinds: string[] }} scope
 */
export async function loadStaffThreads(db, scope) {
  const recent = (q) => q.not('last_message_at', 'is', null).order('last_message_at', { ascending: false }).limit(CHAT_LIST_LIMIT)
  if (scope.role === 'admin') return rows(recent(db.from('chat_threads').select(THREAD_FIELDS)))
  if (scope.role === 'trainer') {
    const own = await rows(db.from('clients').select('id').eq('trainer_id', scope.userId))
    const threads = await loadInChunks(
      own.map((c) => String(c.id)),
      (part) => rows(recent(db.from('chat_threads').select(THREAD_FIELDS).eq('kind', 'trainer').in('client_id', part))),
    )
    return threads.sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at))).slice(0, CHAT_LIST_LIMIT)
  }
  return rows(recent(db.from('chat_threads').select(THREAD_FIELDS).eq('club_id', scope.clubId).in('kind', scope.kinds)))
}

export async function loadClientsByIds(db, ids) {
  return loadInChunks([...new Set(ids.map(String))], (part) =>
    rows(db.from('clients').select('id, name, club_id, trainer_id, archived_at').in('id', part)),
  )
}

export async function loadStaffNames(db, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return new Map()
  const users = await rows(db.from('users').select('id, name').in('id', unique))
  return new Map(users.map((u) => [String(u.id), String(u.name ?? '').trim()]))
}

/** Последняя страница ленты (по возрастанию); before — ISO-время самого старого показанного сообщения. */
export async function loadChatMessages(db, threadId, before) {
  let q = db.from('chat_messages').select(MESSAGE_FIELDS).eq('thread_id', threadId)
  if (before) q = q.lt('created_at', before)
  const desc = await rows(q.order('created_at', { ascending: false }).limit(CHAT_PAGE))
  return { messages: chronological(desc), has_more: desc.length === CHAT_PAGE }
}

/** Диалог создаётся первым сообщением; гонку двух первых сообщений разрешает UNIQUE (client_id, kind). */
export async function ensureChatThread(db, client, kind) {
  const found = await loadChatThread(db, client.id, kind)
  if (found) return found
  const { data, error } = await db
    .from('chat_threads')
    .insert({ client_id: client.id, club_id: client.club_id || null, kind })
    .select(THREAD_FIELDS)
    .single()
  if (!error) return data
  const again = await loadChatThread(db, client.id, kind)
  if (again) return again
  throw error
}

export async function insertChatMessage(db, thread, client, { side, userId, body, sticker = null }) {
  const { data, error } = await db
    .from('chat_messages')
    .insert({
      thread_id: thread.id,
      author_side: side,
      author_client_id: side === 'client' ? client.id : null,
      author_user_id: side === 'staff' ? userId : null,
      body,
      sticker,
    })
    .select(MESSAGE_FIELDS)
    .single()
  if (error) throw error
  const peerUnread = side === 'client' ? 'staff_unread' : 'client_unread'
  const patch = {
    last_message_at: data.created_at,
    last_author: side,
    last_preview: chatPreview(body),
    club_id: client.club_id || thread.club_id || null,
    [side === 'client' ? 'client_read_at' : 'staff_read_at']: data.created_at,
    [side === 'client' ? 'client_unread' : 'staff_unread']: 0,
    [peerUnread]: (Number(thread[peerUnread]) || 0) + 1,
  }
  await rows(db.from('chat_threads').update(patch).eq('id', thread.id).select('id'))
  return { message: data, thread: { ...thread, ...patch } }
}

/** @param {'client'|'staff'} side */
export async function markChatRead(db, thread, side) {
  const column = side === 'client' ? 'client_read_at' : 'staff_read_at'
  const counter = side === 'client' ? 'client_unread' : 'staff_unread'
  const at = new Date().toISOString()
  await rows(db.from('chat_threads').update({ [column]: at, [counter]: 0 }).eq('id', thread.id).select('id'))
  return { ...thread, [column]: at, [counter]: 0 }
}
