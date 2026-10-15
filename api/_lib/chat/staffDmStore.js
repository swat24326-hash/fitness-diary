/**
 * Запросы переписки сотрудников (service role). Права — src/lib/chat/staffDmAccessCore.js, здесь только чтение и запись.
 */
import { chatReadCutoff, isUniqueViolation } from '../../../src/lib/chat/chatDeliveryCore.js'
import { chronological } from '../../../src/lib/chat/chatMessageCore.js'
import { USERS_ADMIN_ROLES, USERS_SALES_MANAGER_ROLES, USERS_SUPERVISOR_ROLES, USERS_TRAINER_ROLES } from '../../../src/lib/userRoleConstants.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { ATTACH_FIELDS, attachColumns } from './chatAttachStore.js'
import { CHAT_PAGE, voiceColumns } from './chatStore.js'

const THREAD_FIELDS =
  'id, club_id, user_lo, user_hi, last_message_at, last_author, last_preview, lo_read_at, hi_read_at, lo_unread, hi_unread, ' +
  'last_reaction_at, last_reaction_emoji, last_reaction_by, lo_reaction_seen_at, hi_reaction_seen_at'
export const DM_MESSAGE_FIELDS =
  'id, body, sticker, created_at, author_user_id, reply_to, voice_key, voice_sec, voice_wave, voice_text, voice_played_at, voice_once, ' + ATTACH_FIELDS
const MESSAGE_FIELDS = DM_MESSAGE_FIELDS
const USER_FIELDS = 'id, name, role, club_id, is_active, avatar_key, status_emoji, status_until'
const DM_ROLES = [...USERS_TRAINER_ROLES, ...USERS_SALES_MANAGER_ROLES, ...USERS_SUPERVISOR_ROLES, ...USERS_ADMIN_ROLES]

export function isMissingDmTable(e) {
  const msg = String(e?.message ?? '')
  return /staff_dm_(threads|messages)/.test(msg) && /does not exist|relation/i.test(msg)
}

export async function loadDmUser(db, userId) {
  const { data, error } = await db.from('users').select(USER_FIELDS).eq('id', userId).maybeSingle()
  if (error) throw error
  return data ?? null
}

/** Сотрудники клуба с ролью переписки; окончательный фильтр — pickStaffDmPeers. */
export function loadClubStaff(db, clubId) {
  return rows(db.from('users').select(USER_FIELDS).eq('club_id', clubId).in('role', DM_ROLES))
}

/** Для главного админа: сотрудники всей сети + название клуба у каждого. */
export async function loadNetworkStaff(db) {
  const [staff, clubs] = await Promise.all([
    rows(db.from('users').select(USER_FIELDS).in('role', DM_ROLES)),
    rows(db.from('clubs').select('id, name')),
  ])
  const names = new Map(clubs.map((c) => [String(c.id), String(c.name ?? '').trim()]))
  return staff.map((u) => ({ ...u, club_name: names.get(String(u.club_id ?? '')) ?? '' }))
}

/** Собеседники из чужих диалогов (главный админ у сотрудника) — по id. */
export async function loadDmUsersByIds(db, userIds) {
  const ids = [...new Set(userIds.map(String))]
  return loadInChunks(ids, (part) => rows(db.from('users').select(USER_FIELDS).in('id', part)))
}

/**
 * «Есть приложение»: разрешённое устройство (планшет или телефон тренера), подписка на уведомления
 * или незакрытый вход (у менеджера и управляющего устройства не привязываются).
 */
export async function loadLiveStaffIds(db, userIds) {
  const ids = [...new Set(userIds.map(String))]
  const [devices, subs, sessions] = await Promise.all([
    loadInChunks(ids, (part) => rows(db.from('user_devices').select('user_id').eq('status', 'approved').in('user_id', part))),
    loadInChunks(ids, (part) => rows(db.from('user_push_subscriptions').select('user_id').in('user_id', part))),
    loadInChunks(ids, (part) => rows(db.from('auth_sessions').select('user_id').is('revoked_at', null).in('user_id', part))),
  ])
  return new Set([...devices, ...subs, ...sessions].map((r) => String(r.user_id)))
}

export async function loadDmThreadsFor(db, userId) {
  const [lo, hi] = await Promise.all([
    rows(db.from('staff_dm_threads').select(THREAD_FIELDS).eq('user_lo', userId)),
    rows(db.from('staff_dm_threads').select(THREAD_FIELDS).eq('user_hi', userId)),
  ])
  return [...lo, ...hi]
}

export async function loadDmThread(db, pair) {
  const { data, error } = await db
    .from('staff_dm_threads')
    .select(THREAD_FIELDS)
    .eq('user_lo', pair.user_lo)
    .eq('user_hi', pair.user_hi)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/** Диалог создаётся первым сообщением; гонку двух первых сообщений разрешает UNIQUE (user_lo, user_hi). */
export async function ensureDmThread(db, pair, clubId) {
  const found = await loadDmThread(db, pair)
  if (found) return found
  const { data, error } = await db
    .from('staff_dm_threads')
    .insert({ ...pair, club_id: clubId || null })
    .select(THREAD_FIELDS)
    .single()
  if (!error) return data
  const again = await loadDmThread(db, pair)
  if (again) return again
  throw error
}

export async function loadDmMessageByClientMsgId(db, threadId, clientMsgId) {
  if (!clientMsgId) return null
  const { data, error } = await db
    .from('staff_dm_messages')
    .select(MESSAGE_FIELDS)
    .eq('thread_id', threadId)
    .eq('client_msg_id', clientMsgId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function countRecentDmMessages(db, threadId, authorId, since, limit) {
  const q = db.from('staff_dm_messages').select('id').eq('thread_id', threadId).eq('author_user_id', authorId).gte('created_at', since)
  return (await rows(q.limit(limit))).length
}

/**
 * Счётчики и «последнее сообщение» обновляет триггер базы (миграция 20261016120000).
 * duplicate — повтор с тем же client_msg_id (гонка двух повторов): сообщение уже было, push не шлём.
 * @returns {Promise<{ message: object, duplicate: boolean }>}
 */
export async function insertDmMessage(db, thread, { authorId, body, sticker = null, clientMsgId = null, replyTo = null, voice = null, attach = null }) {
  const { data, error } = await db
    .from('staff_dm_messages')
    .insert({
      thread_id: thread.id,
      author_user_id: authorId,
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
    const existing = isUniqueViolation(error) ? await loadDmMessageByClientMsgId(db, thread.id, clientMsgId) : null
    if (existing) return { message: existing, duplicate: true }
    throw error
  }
  return { message: data, duplicate: false }
}

/** «Прочитано» до последнего показанного сообщения; пришло новее — не помечаем (как markChatRead). */
export async function markDmRead(db, thread, side, lastShownAt) {
  const cutoff = chatReadCutoff(lastShownAt)
  if (!cutoff) return false
  const updated = await rows(
    db
      .from('staff_dm_threads')
      .update({ [`${side}_read_at`]: new Date().toISOString(), [`${side}_unread`]: 0 })
      .eq('id', thread.id)
      .lt('last_message_at', cutoff)
      .select('id'),
  )
  return updated.length > 0
}

export async function loadDmMessages(db, threadId, before) {
  let q = db.from('staff_dm_messages').select(MESSAGE_FIELDS).eq('thread_id', threadId)
  if (before) q = q.lt('created_at', before)
  const desc = await rows(q.order('created_at', { ascending: false }).limit(CHAT_PAGE))
  return { messages: chronological(desc), has_more: desc.length === CHAT_PAGE }
}
