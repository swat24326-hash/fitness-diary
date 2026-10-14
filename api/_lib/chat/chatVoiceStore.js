/** Голосовое сообщение диалога в базе (service role): найти в своём диалоге, записать расшифровку и «прослушано». */
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { rows } from '../inbox/inboxStore.js'

const VOICE_FIELDS = 'id, created_at, author_user_id, voice_key, voice_sec, voice_text, voice_stt_op, voice_played_at, voice_once'
const FIELDS_OF = { chat_messages: `${VOICE_FIELDS}, author_side`, staff_dm_messages: VOICE_FIELDS, staff_group_messages: VOICE_FIELDS }

/** @param {'chat_messages' | 'staff_dm_messages' | 'staff_group_messages'} table — сообщение ищем только в диалоге, к которому у человека есть доступ */
export async function loadVoiceMessage(db, table, threadId, messageId) {
  if (!threadId || !isInboxUuid(messageId)) return null
  const { data, error } = await db.from(table).select(FIELDS_OF[table]).eq('thread_id', threadId).eq('id', String(messageId).trim()).maybeSingle()
  if (error) throw error
  return data ?? null
}

/** claim — записать номер расшифровки, только если её ещё никто не запустил (два нажатия разом). */
export async function saveVoiceFields(db, table, messageId, patch, { claim = false } = {}) {
  let q = db.from(table).update(patch).eq('id', messageId)
  if (claim) q = q.is('voice_stt_op', null).is('voice_text', null)
  await rows(q.select('id'))
}

/** Первое прослушивание собеседником — время остаётся первым. */
export async function markVoicePlayed(db, table, messageId) {
  await rows(db.from(table).update({ voice_played_at: new Date().toISOString() }).eq('id', messageId).is('voice_played_at', null).select('id'))
}

/** Одноразовое: прослушано и ключ файла стёрт — только если ещё никто не слушал. @returns {Promise<boolean>} получилось ли первым */
export async function claimOnceVoice(db, table, messageId) {
  const patch = { voice_played_at: new Date().toISOString(), voice_key: null }
  const got = await rows(db.from(table).update(patch).eq('id', messageId).is('voice_played_at', null).select('id'))
  return got.length > 0
}
