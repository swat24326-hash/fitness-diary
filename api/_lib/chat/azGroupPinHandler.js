/**
 * Группа АЗ: закреп и «Кто прочитал» (те же имена у /api/coach, admin-data?action=chat и /api/client-me).
 * POST az-group-pin, message_id | null → { pinned } — только инструктор этого чата.
 * GET az-group-readers&message_id → { read, unread } — только у своего сообщения.
 */
import { sendJson } from '../adminSupabase.js'
import { azGroupParticipantKey, buildAzGroupMessageView } from '../../../src/lib/chat/azGroupCore.js'
import {
  AZ_GROUP_PIN_DENIED_RU,
  AZ_GROUP_PIN_GONE_RU,
  AZ_GROUP_READERS_DENIED_RU,
  azGroupReaders,
  buildAzGroupPinned,
  canPinAzGroup,
} from '../../../src/lib/chat/azGroupPinCore.js'
import { clientAzScope, instructorAzScope, loadAzMembers, withAzTable } from './azGroupScope.js'
import { loadAzGroupMessageById, loadAzGroupReads, loadAzGroupThread, saveAzGroupPin } from './azGroupStore.js'

const authorKeyOf = (message) =>
  message?.author_side === 'client'
    ? azGroupParticipantKey({ side: 'client', clientId: message.author_client_id })
    : azGroupParticipantKey({ side: 'user', userId: message.author_user_id })

const nameMap = (members) => new Map(members.map((m) => [azGroupParticipantKey({ side: m.side, userId: m.id, clientId: m.id }), m.name]))

async function pin(res, scope, messageId) {
  if (!canPinAzGroup(scope.viewer, scope.instructorUserId)) {
    sendJson(res, 403, { error: AZ_GROUP_PIN_DENIED_RU })
    return
  }
  const thread = await loadAzGroupThread(scope.db, scope.instructorUserId)
  const message = thread && messageId ? await loadAzGroupMessageById(scope.db, thread.id, messageId) : null
  if (messageId && !message) {
    sendJson(res, 404, { error: AZ_GROUP_PIN_GONE_RU })
    return
  }
  if (thread) await saveAzGroupPin(scope.db, thread.id, message?.id ?? null, scope.viewer.userId)
  const members = message ? await loadAzMembers(scope.db, scope) : []
  const named = message ? { ...message, author_name: nameMap(members).get(authorKeyOf(message)) || '' } : null
  const pinned = named ? buildAzGroupPinned(buildAzGroupMessageView(named, scope.viewer), new Date().toISOString()) : null
  sendJson(res, 200, { pinned })
}

async function readers(res, scope, messageId) {
  const thread = await loadAzGroupThread(scope.db, scope.instructorUserId)
  const message = thread ? await loadAzGroupMessageById(scope.db, thread.id, messageId) : null
  if (!message) {
    sendJson(res, 404, { error: AZ_GROUP_PIN_GONE_RU })
    return
  }
  if (authorKeyOf(message) !== scope.viewerKey) {
    sendJson(res, 403, { error: AZ_GROUP_READERS_DENIED_RU })
    return
  }
  const [members, reads] = await Promise.all([loadAzMembers(scope.db, scope), loadAzGroupReads(scope.db, thread.id)])
  sendJson(res, 200, azGroupReaders(message, members, reads, nameMap(members)))
}

function forInstructor(authCtx, res, requestedId, fn) {
  return withAzTable(res, async () => {
    const scope = await instructorAzScope(authCtx, res, requestedId)
    if (scope) await fn(scope)
  })
}

function forClient(db, client, res, instructorId, fn) {
  return withAzTable(res, async () => {
    const scope = await clientAzScope(db, client, res, instructorId)
    if (scope) await fn(scope)
  })
}

export function pinAzGroupMessage(authCtx, res, messageId, requestedId) {
  return forInstructor(authCtx, res, requestedId, (scope) => pin(res, scope, messageId))
}

export function sendAzGroupReaders(authCtx, res, messageId, requestedId) {
  return forInstructor(authCtx, res, requestedId, (scope) => readers(res, scope, messageId))
}

export function pinClientAzGroupMessage(db, client, res, instructorId, messageId) {
  return forClient(db, client, res, instructorId, (scope) => pin(res, scope, messageId))
}

export function sendClientAzGroupReaders(db, client, res, instructorId, messageId) {
  return forClient(db, client, res, instructorId, (scope) => readers(res, scope, messageId))
}
