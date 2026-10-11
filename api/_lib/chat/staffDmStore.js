/**
 * Запросы переписки сотрудников (service role). Права — src/lib/chat/staffDmAccessCore.js, здесь только чтение и запись.
 */
import { chatPreview, chronological } from '../../../src/lib/chat/chatMessageCore.js'
import { USERS_SALES_MANAGER_ROLES, USERS_SUPERVISOR_ROLES, USERS_TRAINER_ROLES } from '../../../src/lib/userRoleConstants.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { CHAT_PAGE } from './chatStore.js'

const THREAD_FIELDS =
  'id, club_id, user_lo, user_hi, last_message_at, last_author, last_preview, lo_read_at, hi_read_at, lo_unread, hi_unread'
const MESSAGE_FIELDS = 'id, body, sticker, created_at, author_user_id'
const USER_FIELDS = 'id, name, role, club_id, is_active'
const DM_ROLES = [...USERS_TRAINER_ROLES, ...USERS_SALES_MANAGER_ROLES, ...USERS_SUPERVISOR_ROLES]

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

/** «Есть приложение»: подключённый телефон тренера или подписка на уведомления. */
export async function loadLiveStaffIds(db, userIds) {
  const ids = [...new Set(userIds.map(String))]
  const [phones, subs] = await Promise.all([
    loadInChunks(ids, (part) =>
      rows(db.from('user_devices').select('user_id').eq('status', 'approved').like('device_id', 'coach-%').in('user_id', part)),
    ),
    loadInChunks(ids, (part) => rows(db.from('user_push_subscriptions').select('user_id').in('user_id', part))),
  ])
  return new Set([...phones, ...subs].map((r) => String(r.user_id)))
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

/** side — сторона автора ('lo' | 'hi'). */
export async function insertDmMessage(db, thread, side, { authorId, body, sticker = null }) {
  const { data, error } = await db
    .from('staff_dm_messages')
    .insert({ thread_id: thread.id, author_user_id: authorId, body, sticker })
    .select(MESSAGE_FIELDS)
    .single()
  if (error) throw error
  const peer = side === 'lo' ? 'hi' : 'lo'
  const patch = {
    last_message_at: data.created_at,
    last_author: authorId,
    last_preview: chatPreview(body),
    [`${side}_read_at`]: data.created_at,
    [`${side}_unread`]: 0,
    [`${peer}_unread`]: (Number(thread[`${peer}_unread`]) || 0) + 1,
  }
  await rows(db.from('staff_dm_threads').update(patch).eq('id', thread.id).select('id'))
  return data
}

export async function markDmRead(db, thread, side) {
  const at = new Date().toISOString()
  await rows(db.from('staff_dm_threads').update({ [`${side}_read_at`]: at, [`${side}_unread`]: 0 }).eq('id', thread.id).select('id'))
}

export async function loadDmMessages(db, threadId, before) {
  let q = db.from('staff_dm_messages').select(MESSAGE_FIELDS).eq('thread_id', threadId)
  if (before) q = q.lt('created_at', before)
  const desc = await rows(q.order('created_at', { ascending: false }).limit(CHAT_PAGE))
  return { messages: chronological(desc), has_more: desc.length === CHAT_PAGE }
}
