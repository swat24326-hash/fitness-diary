/**
 * Чат клуба, как в группах Telegram (те же view/op у /api/coach и admin-data?action=chat):
 * POST { op: 'group-pin', club_id, message_id | null } → { pinned } — закрепить / открепить (управляющий и главный админ)
 * GET  group-readers&club_id&message_id → { read: [{ id, name }], unread: [{ id, name }] } — только у своего сообщения
 */
import { sendJson } from '../adminSupabase.js'
import { buildStaffGroupMessageView } from '../../../src/lib/chat/staffGroupCore.js'
import {
  STAFF_GROUP_PIN_DENIED_RU,
  STAFF_GROUP_PIN_GONE_RU,
  STAFF_GROUP_READERS_DENIED_RU,
  buildStaffGroupPinned,
  canPinStaffGroup,
  staffGroupReaders,
} from '../../../src/lib/chat/staffGroupPinCore.js'
import { groupScope, loadMembers, withGroupTable } from './staffGroupScope.js'
import { loadAuthorNames, loadGroupMessageById, loadGroupReads, loadGroupThread, saveGroupPin } from './staffGroupStore.js'

export function pinStaffGroupMessage(authCtx, res, clubId, messageId) {
  return withGroupTable(res, async () => {
    const scope = await groupScope(authCtx, res, clubId)
    if (!scope) return
    if (!canPinStaffGroup(scope.viewer)) {
      sendJson(res, 403, { error: STAFF_GROUP_PIN_DENIED_RU })
      return
    }
    const thread = await loadGroupThread(scope.db, scope.clubId)
    const message = thread && messageId ? await loadGroupMessageById(scope.db, thread.id, messageId) : null
    if (messageId && !message) {
      sendJson(res, 404, { error: STAFF_GROUP_PIN_GONE_RU })
      return
    }
    if (thread) await saveGroupPin(scope.db, thread.id, message?.id ?? null, scope.viewer.id)
    const names = message ? await loadAuthorNames(scope.db, [message.author_user_id]) : null
    const pinned = message ? buildStaffGroupPinned(buildStaffGroupMessageView(message, scope.viewer.id, names), new Date().toISOString()) : null
    sendJson(res, 200, { pinned })
  })
}

export function sendStaffGroupReaders(authCtx, res, clubId, messageId) {
  return withGroupTable(res, async () => {
    const scope = await groupScope(authCtx, res, clubId)
    if (!scope) return
    const thread = await loadGroupThread(scope.db, scope.clubId)
    const message = thread ? await loadGroupMessageById(scope.db, thread.id, messageId) : null
    if (!message) {
      sendJson(res, 404, { error: STAFF_GROUP_PIN_GONE_RU })
      return
    }
    if (String(message.author_user_id ?? '') !== scope.viewer.id) {
      sendJson(res, 403, { error: STAFF_GROUP_READERS_DENIED_RU })
      return
    }
    const [members, reads] = await Promise.all([loadMembers(scope.db, scope.clubId), loadGroupReads(scope.db, thread.id)])
    const names = await loadAuthorNames(scope.db, members.map((u) => u.id))
    sendJson(res, 200, staffGroupReaders(message, members, reads, names))
  })
}
