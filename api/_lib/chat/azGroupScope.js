/** Группа АЗ: кто открывает и чей инструктор — общее для ленты, закрепа и «Кто прочитал». Волна 1 без надзора админа. */
import { sendJson } from '../adminSupabase.js'
import {
  AZ_GROUP_NO_ACCESS_RU,
  AZ_GROUP_UNAVAILABLE_RU,
  azGroupAccess,
  azGroupParticipantKey,
  pickAzGroupMembers,
} from '../../../src/lib/chat/azGroupCore.js'
import { chatStaffRole } from '../../../src/lib/chat/chatAccessCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { isMissingAzGroupTable, loadAzInstructor, loadAzLinks } from './azGroupStore.js'

const lower = (v) => String(v ?? '').trim().toLowerCase()

export async function withAzTable(res, fn) {
  try {
    await fn()
  } catch (e) {
    if (!isMissingAzGroupTable(e)) throw e
    sendJson(res, 503, { error: AZ_GROUP_UNAVAILABLE_RU })
  }
}

function firstClub(user, links) {
  for (const id of [user?.club_id, ...(links ?? []).map((l) => l.club_id)]) {
    const s = lower(id)
    if (isInboxUuid(s)) return s
  }
  return ''
}

function scopeOf({ db, viewer, instructorUserId, instructorName, clubId, links }) {
  const viewerKey =
    viewer.kind === 'client'
      ? azGroupParticipantKey({ side: 'client', clientId: viewer.clientId })
      : azGroupParticipantKey({ side: 'user', userId: viewer.userId })
  return { db, viewer, viewerKey, instructorUserId, instructorName, clubId, links }
}

/** Инструктор — только свой тред. Чужой id, админ, менеджер и управляющий — 403. null — ответ уже отправлен. */
export async function instructorAzScope(authCtx, res, requestedId) {
  if (chatStaffRole(authCtx) !== 'trainer') {
    sendJson(res, 403, { error: AZ_GROUP_NO_ACCESS_RU })
    return null
  }
  const userId = lower(authCtx.user?.id)
  if (!isInboxUuid(userId)) {
    sendJson(res, 403, { error: AZ_GROUP_NO_ACCESS_RU })
    return null
  }
  const requested = lower(requestedId)
  if (requested && requested !== userId) {
    sendJson(res, 403, { error: AZ_GROUP_NO_ACCESS_RU })
    return null
  }
  const access = azGroupAccess({ kind: 'instructor', userId }, { instructorUserId: userId })
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error })
    return null
  }
  const db = authCtx.supabaseAdmin
  const [user, links] = await Promise.all([loadAzInstructor(db, userId), loadAzLinks(db, userId)])
  if (!user) {
    sendJson(res, 403, { error: AZ_GROUP_NO_ACCESS_RU })
    return null
  }
  return scopeOf({
    db,
    viewer: { kind: 'instructor', userId },
    instructorUserId: userId,
    instructorName: String(user.name ?? '').trim(),
    clubId: firstClub(user, links),
    links,
  })
}

/** Клиент — только если он в client_az_instructors этого инструктора. */
export async function clientAzScope(db, client, res, requestedId) {
  const instructorUserId = lower(requestedId)
  if (!isInboxUuid(instructorUserId)) {
    sendJson(res, 400, { error: 'Не указан инструктор' })
    return null
  }
  const clientId = lower(client?.id)
  const links = await loadAzLinks(db, instructorUserId)
  const access = azGroupAccess({ kind: 'client', clientId }, { instructorUserId, clientIds: links.map((l) => l.client_id) })
  if (!access.ok) {
    sendJson(res, access.status, { error: access.error })
    return null
  }
  const user = await loadAzInstructor(db, instructorUserId)
  return scopeOf({
    db,
    viewer: { kind: 'client', clientId },
    instructorUserId,
    instructorName: String(user?.name ?? '').trim(),
    clubId: firstClub(user, links),
    links,
  })
}

export async function loadAzMembers(db, scope) {
  const ids = [...new Set((scope.links ?? []).map((l) => lower(l.client_id)).filter((id) => isInboxUuid(id)))]
  const clients = ids.length ? await loadInChunks(ids, (part) => rows(db.from('clients').select('id, name').in('id', part))) : []
  return pickAzGroupMembers({
    instructorId: scope.instructorUserId,
    instructorName: scope.instructorName,
    links: scope.links,
    clients,
  })
}
