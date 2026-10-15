/**
 * Запросы переписки (service role). Правила доступа — в src/lib/chat/chatAccessCore.js, здесь только чтение и запись.
 */
import { chatReadCutoff, isUniqueViolation, mergeChatThreads } from '../../../src/lib/chat/chatDeliveryCore.js'
import { chronological } from '../../../src/lib/chat/chatMessageCore.js'
import { avatarPhotoUrl } from '../../../src/lib/profile/avatarCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { ATTACH_FIELDS, attachColumns } from './chatAttachStore.js'

export const CHAT_PAGE = 60
export const CHAT_LIST_LIMIT = 100
/** Непрочитанные показываем и старше последних 100 — иначе конверт врёт, а диалог не найти. */
export const CHAT_UNREAD_LIMIT = 500
export const CHAT_THREAD_FIELDS =
  'id, club_id, client_id, kind, last_message_at, last_author, last_preview, client_read_at, staff_read_at, client_unread, staff_unread, ' +
  'last_reaction_at, last_reaction_emoji, last_reaction_by, client_reaction_seen_at, staff_reaction_seen_at'
const THREAD_FIELDS = CHAT_THREAD_FIELDS
export const CHAT_MESSAGE_FIELDS =
  'id, body, sticker, created_at, author_side, author_user_id, reply_to, voice_key, voice_sec, voice_wave, voice_text, voice_played_at, voice_once, ' +
  ATTACH_FIELDS
const MESSAGE_FIELDS = CHAT_MESSAGE_FIELDS

export function isMissingChatTable(e) {
  const msg = String(e?.message ?? '')
  return /chat_(threads|messages)/.test(msg) && /does not exist|relation/i.test(msg)
}

/** Клиент в переписке: права (club_id, trainer_id, archived_at) и фото профиля. */
const CHAT_CLIENT_FIELDS = 'id, name, club_id, trainer_id, archived_at, avatar_key'

export async function loadChatClient(db, clientId) {
  const { data, error } = await db
    .from('clients')
    .select(CHAT_CLIENT_FIELDS)
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
  const latest = (q, limit) => q.order('last_message_at', { ascending: false }).limit(limit)
  const recent = (q) => latest(q.not('last_message_at', 'is', null), CHAT_LIST_LIMIT)
  const unread = (q) => latest(q.gt('staff_unread', 0), CHAT_UNREAD_LIMIT)
  let load
  if (scope.role === 'admin') load = (shape) => rows(shape(db.from('chat_threads').select(THREAD_FIELDS)))
  else if (scope.role === 'trainer') {
    const own = (await rows(db.from('clients').select('id').eq('trainer_id', scope.userId))).map((c) => String(c.id))
    load = async (shape, limit) =>
      (await loadInChunks(own, (part) => rows(shape(db.from('chat_threads').select(THREAD_FIELDS).eq('kind', 'trainer').in('client_id', part)))))
        .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))
        .slice(0, limit)
  } else load = (shape) => rows(shape(db.from('chat_threads').select(THREAD_FIELDS).eq('club_id', scope.clubId).in('kind', scope.kinds)))
  const [fresh, waiting] = await Promise.all([load(recent, CHAT_LIST_LIMIT), load(unread, CHAT_UNREAD_LIMIT)])
  return mergeChatThreads(fresh, waiting)
}

export async function loadClientsByIds(db, ids) {
  return loadInChunks([...new Set(ids.map(String))], (part) =>
    rows(db.from('clients').select(CHAT_CLIENT_FIELDS).in('id', part)),
  )
}

export async function loadStaffNames(db, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return new Map()
  const users = await rows(db.from('users').select('id, name').in('id', unique))
  return new Map(users.map((u) => [String(u.id), String(u.name ?? '').trim()]))
}

/** Сотрудники по id → { name, photo } (имя и фото тренера у клиента в списке и шапке диалога). */
export async function loadStaffCards(db, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  if (!unique.length) return new Map()
  const users = await rows(db.from('users').select('id, name, avatar_key').in('id', unique))
  return new Map(users.map((u) => [String(u.id), { name: String(u.name ?? '').trim(), photo: avatarPhotoUrl(u.avatar_key, 'staff', u.id) }]))
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

export async function loadChatMessageByClientMsgId(db, threadId, clientMsgId) {
  if (!clientMsgId) return null
  const { data, error } = await db
    .from('chat_messages')
    .select(MESSAGE_FIELDS)
    .eq('thread_id', threadId)
    .eq('client_msg_id', clientMsgId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/** Сколько сообщений автор отправил в диалог с since (не больше limit — дальше считать незачем). */
export async function countRecentChatMessages(db, threadId, { side, userId }, since, limit) {
  let q = db.from('chat_messages').select('id').eq('thread_id', threadId).eq('author_side', side).gte('created_at', since)
  if (side === 'staff') q = q.eq('author_user_id', userId)
  return (await rows(q.limit(limit))).length
}

/** Колонки голосового (миграции 20261020120000, 20261022120000); voice — { key, sec, wave, once } после загрузки в хранилище. */
export function voiceColumns(voice) {
  if (!voice) return {}
  return { voice_key: voice.key, voice_sec: voice.sec, voice_wave: voice.wave, ...(voice.once ? { voice_once: true } : {}) }
}

/**
 * Счётчики, «последнее сообщение» и превью диалога обновляет триггер базы (миграция 20261016120000).
 * duplicate — повтор с тем же client_msg_id (гонка двух повторов): сообщение уже было, push не шлём.
 * @returns {Promise<{ message: object, duplicate: boolean }>}
 */
export async function insertChatMessage(db, thread, client, { side, userId, body, sticker = null, clientMsgId = null, replyTo = null, voice = null, attach = null }) {
  const { data, error } = await db
    .from('chat_messages')
    .insert({
      thread_id: thread.id,
      author_side: side,
      author_client_id: side === 'client' ? client.id : null,
      author_user_id: side === 'staff' ? userId : null,
      body,
      sticker,
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...voiceColumns(voice),
      ...attachColumns(attach),
    })
    .select(MESSAGE_FIELDS)
    .single()
  if (error) {
    const existing = isUniqueViolation(error) ? await loadChatMessageByClientMsgId(db, thread.id, clientMsgId) : null
    if (existing) return { message: existing, duplicate: true }
    throw error
  }
  const clubId = client.club_id || null
  if (clubId && clubId !== thread.club_id) {
    await rows(db.from('chat_threads').update({ club_id: clubId }).eq('id', thread.id).select('id'))
  }
  return { message: data, duplicate: false }
}

/**
 * «Прочитано» до последнего показанного сообщения. Пришло новее, пока открывали, — не помечаем:
 * следующее обновление ленты покажет его и пометит.
 * @param {'client'|'staff'} side
 * @returns {Promise<boolean>} true — пометили
 */
export async function markChatRead(db, thread, side, lastShownAt) {
  const cutoff = chatReadCutoff(lastShownAt)
  if (!cutoff) return false
  const column = side === 'client' ? 'client_read_at' : 'staff_read_at'
  const counter = side === 'client' ? 'client_unread' : 'staff_unread'
  const updated = await rows(
    db
      .from('chat_threads')
      .update({ [column]: new Date().toISOString(), [counter]: 0 })
      .eq('id', thread.id)
      .lt('last_message_at', cutoff)
      .select('id'),
  )
  return updated.length > 0
}
