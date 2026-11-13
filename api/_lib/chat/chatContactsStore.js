/**
 * Люди для папок «Сообщений» (service role). Правила «ярко / тускло» и порядок — src/lib/chat/chatContactsCore.js.
 */
import { azContactSubtitle } from '../../../src/lib/chat/chatContactsCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { CHAT_CLIENT_FIELDS, CHAT_THREAD_FIELDS } from './chatStore.js'

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

async function loadDirectionNames(db, directionIds) {
  const ids = [...new Set((directionIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (!ids.length) return new Map()
  try {
    const types = await rows(db.from('membership_types').select('id, code').in('id', ids))
    return new Map(types.map((t) => [String(t.id), String(t.code ?? '').trim()]))
  } catch {
    return new Map()
  }
}

/**
 * Клиенты тренера (ПЗ) + назначения АЗ этого инструктора, живые входы и диалоги.
 * @returns {Promise<{
 *   clients: object[],
 *   liveClientIds: string[],
 *   threads: object[],
 *   azClients: object[],
 *   azLiveClientIds: string[],
 *   azThreads: object[],
 *   azSubtitleByClientId: Map<string, string>,
 * }>}
 */
export async function loadTrainerClientContacts(db, trainerId) {
  const instructorId = String(trainerId ?? '').trim()
  const [clients, azLinks] = await Promise.all([
    pagedRows(() =>
      db
        .from('clients')
        .select(CHAT_CLIENT_FIELDS)
        .eq('trainer_id', instructorId)
        .is('archived_at', null)
        .order('id'),
    ),
    pagedRows(() =>
      db.from('client_az_instructors').select('client_id, direction_type_id').eq('instructor_id', instructorId).order('client_id'),
    ),
  ])

  const pzIds = clients.map((c) => String(c.id))
  const azLinkClientIds = [...new Set(azLinks.map((r) => String(r.client_id ?? '').trim()).filter(Boolean))]

  const [sessions, threads, azClientRows, azThreads, dirNames] = await Promise.all([
    loadInChunks(pzIds, (part) => rows(db.from('client_sessions').select('client_id').is('revoked_at', null).in('client_id', part))),
    loadInChunks(pzIds, (part) => rows(db.from('chat_threads').select(CHAT_THREAD_FIELDS).eq('kind', 'trainer').in('client_id', part))),
    azLinkClientIds.length
      ? loadInChunks(azLinkClientIds, (part) =>
          rows(db.from('clients').select(CHAT_CLIENT_FIELDS).in('id', part).is('archived_at', null)),
        )
      : Promise.resolve([]),
    rows(
      db.from('chat_threads').select(CHAT_THREAD_FIELDS).eq('kind', 'az_instructor').eq('peer_user_id', instructorId),
    ),
    loadDirectionNames(
      db,
      azLinks.map((r) => r.direction_type_id),
    ),
  ])

  const azClients = azClientRows
  const azIds = azClients.map((c) => String(c.id))
  const azIdSet = new Set(azIds)
  const azSessions = azIds.length
    ? await loadInChunks(azIds, (part) =>
        rows(db.from('client_sessions').select('client_id').is('revoked_at', null).in('client_id', part)),
      )
    : []

  /** @type {Map<string, string[]>} */
  const dirsByClient = new Map()
  for (const link of azLinks) {
    const cid = String(link.client_id ?? '').trim()
    if (!azIdSet.has(cid)) continue
    const dir = dirNames.get(String(link.direction_type_id ?? '').trim()) || ''
    const list = dirsByClient.get(cid) ?? []
    list.push(dir)
    dirsByClient.set(cid, list)
  }
  /** @type {Map<string, string>} */
  const azSubtitleByClientId = new Map()
  for (const id of azIds) {
    azSubtitleByClientId.set(id, azContactSubtitle(dirsByClient.get(id) ?? []))
  }

  return {
    clients,
    liveClientIds: sessions.map((s) => String(s.client_id)),
    threads,
    azClients,
    azLiveClientIds: azSessions.map((s) => String(s.client_id)),
    azThreads: (azThreads ?? []).filter((t) => azIdSet.has(String(t.client_id))),
    azSubtitleByClientId,
  }
}
