/** Список групп АЗ клиента и число для конверта. Лента — azGroupHandler.js. */
import { sendJson } from '../adminSupabase.js'
import { azGroupAttention, azGroupParticipantKey, azGroupSummary, pickAzGroupMembers } from '../../../src/lib/chat/azGroupCore.js'
import { chatStaffRole } from '../../../src/lib/chat/chatAccessCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { loadStaffNames } from './chatStore.js'
import { withAzTable } from './azGroupScope.js'
import {
  countAzGroupUnread,
  isMissingAzGroupTable,
  loadAzGroupRead,
  loadAzGroupThread,
  loadAzGroupThreads,
  loadAzInstructor,
  loadAzLinks,
  loadAzLinksForClient,
  loadAzLinksForInstructors,
  loadAzReadsForParticipant,
  loadClientNames,
} from './azGroupStore.js'

const lower = (v) => String(v ?? '').trim().toLowerCase()

const authorKeyOf = (m) =>
  m?.author_side === 'client'
    ? azGroupParticipantKey({ side: 'client', clientId: m.author_client_id })
    : azGroupParticipantKey({ side: 'user', userId: m.author_user_id })

function linksByInstructor(links) {
  const map = new Map()
  for (const link of links ?? []) {
    const id = lower(link.instructor_id)
    if (!isInboxUuid(id)) continue
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(link)
  }
  return map
}

const lastAuthorKey = (thread) =>
  thread?.last_message_at
    ? authorKeyOf({
        author_side: thread.last_author_side,
        author_user_id: thread.last_author_user_id,
        author_client_id: thread.last_author_client_id,
      })
    : ''

/** Строки групп инструкторов клиента. Пусто, если назначений нет. */
export async function loadClientAzGroups(db, client) {
  const clientId = lower(client?.id)
  if (!isInboxUuid(clientId)) return []
  const own = await loadAzLinksForClient(db, clientId)
  const instructorIds = [...new Set(own.map((l) => lower(l.instructor_id)).filter((id) => isInboxUuid(id)))]
  if (!instructorIds.length) return []
  const [threads, allLinks] = await Promise.all([loadAzGroupThreads(db, instructorIds), loadAzLinksForInstructors(db, instructorIds)])
  const viewerKey = azGroupParticipantKey({ side: 'client', clientId })
  const reads = await loadAzReadsForParticipant(db, threads.map((t) => t.id), viewerKey)
  const threadOf = new Map(threads.map((t) => [lower(t.instructor_user_id), t]))
  const readOf = new Map(reads.map((r) => [String(r.thread_id), r]))
  const linksOf = linksByInstructor(allLinks)
  const userIds = [...instructorIds]
  const clientIds = []
  for (const t of threads) {
    if (t.last_author_side === 'client' && t.last_author_client_id) clientIds.push(t.last_author_client_id)
    else if (t.last_author_user_id) userIds.push(t.last_author_user_id)
  }
  const [staff, clients] = await Promise.all([loadStaffNames(db, userIds), loadClientNames(db, clientIds)])
  const names = new Map()
  for (const [id, name] of staff) names.set(azGroupParticipantKey({ side: 'user', userId: id }), name)
  for (const [id, name] of clients) names.set(azGroupParticipantKey({ side: 'client', clientId: id }), name)
  const groups = await Promise.all(
    instructorIds.map(async (iid) => {
      const thread = threadOf.get(iid) ?? null
      const read = thread ? (readOf.get(String(thread.id)) ?? null) : null
      const key = azGroupParticipantKey({ side: 'user', userId: iid })
      const summary = azGroupSummary({
        instructorUserId: iid,
        instructorName: names.get(key) || '',
        members: pickAzGroupMembers({ instructorId: iid, instructorName: names.get(key) || '', links: linksOf.get(iid) ?? [] }).length,
        thread,
        read,
        unreadCount: 0,
        viewerKey,
        lastAuthorName: names.get(lastAuthorKey(thread)) || '',
      })
      if (!summary.unread || !thread) return summary
      const unreadCount = await countAzGroupUnread(db, thread.id, viewerKey, read?.read_at ?? null)
      return { ...summary, unread_count: Math.max(1, unreadCount) }
    }),
  )
  groups.sort((a, b) => Number(b.unread) - Number(a.unread) || String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
  return groups
}

export function sendClientAzGroupList(db, client, res) {
  return withAzTable(res, async () => {
    sendJson(res, 200, { groups: await loadClientAzGroups(db, client) })
  })
}

/**
 * Строка «Группа АЗ» в «Клиентах» инструктора. Нет подопечных, не тренер или таблиц ещё нет — null.
 * Имя инструктора в заголовок не кладём: у себя это просто «Группа АЗ».
 */
export async function loadInstructorAzGroup(authCtx) {
  if (chatStaffRole(authCtx) !== 'trainer') return null
  const userId = lower(authCtx.user?.id)
  if (!isInboxUuid(userId)) return null
  try {
    const db = authCtx.supabaseAdmin
    const links = await loadAzLinks(db, userId)
    if (!links.length) return null
    const user = await loadAzInstructor(db, userId)
    const thread = await loadAzGroupThread(db, userId)
    const viewerKey = azGroupParticipantKey({ side: 'user', userId })
    const read = thread ? await loadAzGroupRead(db, thread.id, viewerKey) : null
    let lastAuthorName = ''
    if (thread?.last_author_side === 'client' && thread.last_author_client_id) {
      lastAuthorName = (await loadClientNames(db, [thread.last_author_client_id])).get(lower(thread.last_author_client_id)) || ''
    } else if (thread?.last_author_user_id) {
      lastAuthorName = (await loadStaffNames(db, [thread.last_author_user_id])).get(String(thread.last_author_user_id)) || ''
    }
    const summary = azGroupSummary({
      instructorUserId: userId,
      members: pickAzGroupMembers({ instructorId: userId, instructorName: user?.name, links }).length,
      thread,
      read,
      unreadCount: 0,
      viewerKey,
      lastAuthorName,
    })
    if (!summary.unread || !thread) return summary
    const unreadCount = await countAzGroupUnread(db, thread.id, viewerKey, read?.read_at ?? null)
    return { ...summary, unread_count: Math.max(1, unreadCount) }
  } catch (e) {
    if (isMissingAzGroupTable(e)) return null
    throw e
  }
}

/** Незаглушённая группа своего инструкторского треда с новым — +1 к конверту. Не тренер — 0. */
export async function azGroupsAttention(authCtx) {
  if (chatStaffRole(authCtx) !== 'trainer') return 0
  const userId = lower(authCtx.user?.id)
  if (!isInboxUuid(userId)) return 0
  try {
    const thread = await loadAzGroupThread(authCtx.supabaseAdmin, userId)
    if (!thread) return 0
    const viewerKey = azGroupParticipantKey({ side: 'user', userId })
    const read = await loadAzGroupRead(authCtx.supabaseAdmin, thread.id, viewerKey)
    return azGroupAttention(azGroupSummary({ instructorUserId: userId, members: 0, thread, read, unreadCount: 0, viewerKey }))
  } catch (e) {
    if (isMissingAzGroupTable(e)) return 0
    throw e
  }
}

/** Сколько групп АЗ клиента ждут ответа (для конверта /me). Таблиц ещё нет — 0. */
export async function clientAzGroupsAttention(db, clientId) {
  const id = lower(clientId)
  if (!isInboxUuid(id)) return 0
  try {
    const links = await loadAzLinksForClient(db, id)
    const instructorIds = [...new Set(links.map((l) => lower(l.instructor_id)).filter((x) => isInboxUuid(x)))]
    if (!instructorIds.length) return 0
    const threads = await loadAzGroupThreads(db, instructorIds)
    const viewerKey = azGroupParticipantKey({ side: 'client', clientId: id })
    const reads = await loadAzReadsForParticipant(db, threads.map((t) => t.id), viewerKey)
    const readOf = new Map(reads.map((r) => [String(r.thread_id), r]))
    let n = 0
    for (const thread of threads) {
      const read = readOf.get(String(thread.id)) ?? null
      n += azGroupAttention(
        azGroupSummary({ instructorUserId: thread.instructor_user_id, members: 0, thread, read, unreadCount: 0, viewerKey }),
      )
    }
    return n
  } catch (e) {
    if (isMissingAzGroupTable(e)) return 0
    throw e
  }
}
