/**
 * Люди для папок «Сообщений» (service role). Правила «ярко / тускло» и порядок — src/lib/chat/chatContactsCore.js.
 */
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { CHAT_THREAD_FIELDS } from './chatStore.js'

const PAGE = 1000

/** Все строки запроса страницами: лимит ответа БД не режет список молча. */
async function pagedRows(makeQuery) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/**
 * Клиенты тренера (без архива), у кого живой вход в приложение, и диалоги «Тренер».
 * @returns {Promise<{ clients: object[], liveClientIds: string[], threads: object[] }>}
 */
export async function loadTrainerClientContacts(db, trainerId) {
  const clients = await pagedRows(() =>
    db.from('clients').select('id, name, club_id, trainer_id, archived_at, avatar_key, status_emoji, status_until, birth_date').eq('trainer_id', trainerId).is('archived_at', null).order('id'),
  )
  const ids = clients.map((c) => String(c.id))
  const [sessions, threads] = await Promise.all([
    loadInChunks(ids, (part) => rows(db.from('client_sessions').select('client_id').is('revoked_at', null).in('client_id', part))),
    loadInChunks(ids, (part) => rows(db.from('chat_threads').select(CHAT_THREAD_FIELDS).eq('kind', 'trainer').in('client_id', part))),
  ])
  return { clients, liveClientIds: sessions.map((s) => String(s.client_id)), threads }
}
