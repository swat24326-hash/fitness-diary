/**
 * Чат клуба: /api/coach и admin-data?action=chat (те же view/op). club_id сотрудник может не передавать — свой клуб.
 * GET  group-thread&club_id[&before][&seen=0] → { group: { club_id, name, members }, can_write, muted, voice_ready, messages, has_more, marked_read, peer_read_at }
 * GET  group-search&club_id&q → { results }
 * POST { op: 'group-send', club_id, body | sticker | (audio, sec, wave), reply_to?, client_msg_id?, silent? } → { message }
 * POST { op: 'group-react', club_id, message_id, emoji|null } → { message_id, reactions }
 * POST { op: 'group-voice-audio' | 'group-voice-text', club_id, message_id } → { audio, mime } | { done, text? }
 * POST { op: 'group-attach', club_id, message_id } → { data, mime, name } — фото / PDF (сутки); в group-send — attach { kind, data, name?, w?, h? }
 * POST { op: 'group-mute', club_id, muted } → { muted } — «без звука»: без push и без числа на конверте
 * Тренер, связанный с управляющим, в чате — от учётки управляющего (один человек). Текст сообщений в лог не пишем.
 */
import { sendJson } from '../adminSupabase.js'
import {
  CHAT_SEND_LIMIT_RU,
  CHAT_SEND_PER_MINUTE,
  chatSendWindowStart,
  isChatSendLimited,
  normalizeClientMsgId,
} from '../../../src/lib/chat/chatDeliveryCore.js'
import { CHAT_REACTION_GONE_RU, chatReactorKey } from '../../../src/lib/chat/chatReactionCore.js'
import { chatReplyQuoteFor } from '../../../src/lib/chat/chatReplyCore.js'
import { buildChatSearchHit, normalizeChatSearchQuery } from '../../../src/lib/chat/chatSearchCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import { staffDmRoleOf } from '../../../src/lib/chat/staffDmAccessCore.js'
import {
  buildStaffGroupMessageView,
  pickStaffGroupMembers,
  staffGroupAttention,
  staffGroupPeerReadAt,
  staffGroupReadAt,
  staffGroupSummary,
} from '../../../src/lib/chat/staffGroupCore.js'
import { buildStaffGroupPinned, canPinStaffGroup, staffGroupSeenCount } from '../../../src/lib/chat/staffGroupPinCore.js'
import { loadReactionsFor, setMessageReaction } from './chatReactionStore.js'
import { loadReplyTarget, loadReplyTargets } from './chatReplyStore.js'
import { searchThreadMessages } from './chatSearchStore.js'
import { answerChatAttach, storeChatOutgoing } from './chatAttachHandler.js'
import { answerChatVoice, chatVoiceBlocked } from './chatVoiceHandler.js'
import { chatVoiceStorageMode } from './chatVoiceStorage.js'
import { loadLinkedStaffView, staffDmCtx } from './linkedStaffStore.js'
import { loadNetworkStaff } from './staffDmStore.js'
import { sendStaffGroupPush } from './staffGroupPushJob.js'
import { groupScope, loadMembers, viewerOf, withGroupTable } from './staffGroupScope.js'
import {
  countGroupUnread,
  countRecentGroupMessages,
  ensureGroupThread,
  insertGroupMessage,
  isMissingGroupTable,
  loadAuthorNames,
  loadClubName,
  loadClubs,
  loadGroupMessageByClientMsgId,
  loadGroupMessages,
  loadGroupPin,
  loadGroupRead,
  loadGroupReads,
  loadGroupThread,
  loadGroupThreads,
  loadUserGroupReads,
  saveGroupRead,
} from './staffGroupStore.js'

const isIsoCursor = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))

export function sendStaffGroupThread(authCtx, res, clubId, before, seen) {
  return withGroupTable(res, async () => {
    const scope = await groupScope(authCtx, res, clubId)
    if (!scope) return
    const { db, viewer } = scope
    const [members, thread] = await Promise.all([loadMembers(db, scope.clubId), loadGroupThread(db, scope.clubId)])
    const read = thread ? await loadGroupRead(db, thread.id, viewer.id) : null
    const meta = {
      group: { club_id: scope.clubId, name: scope.clubName, members: members.length },
      can_write: true,
      can_pin: canPinStaffGroup(viewer),
      muted: read?.muted === true,
      voice_ready: chatVoiceStorageMode() != null,
    }
    if (!thread) {
      sendJson(res, 200, { ...meta, pinned: null, messages: [], has_more: false, marked_read: false, peer_read_at: null })
      return
    }
    const page = await loadGroupMessages(db, thread.id, isIsoCursor(before) ? before : null)
    const readAt = !before && chatSeenFromRequest(seen) ? staffGroupReadAt(read, page.messages.at(-1)?.created_at) : null
    if (readAt) await saveGroupRead(db, thread.id, viewer.id, { read_at: readAt })
    const [reactions, quoted, reads, pin] = await Promise.all([
      loadReactionsFor(db, 'group', page.messages.map((m) => m.id), chatReactorKey('staff', viewer.id)),
      loadReplyTargets(db, 'group', thread.id, page.messages),
      loadGroupReads(db, thread.id),
      loadGroupPin(db, thread.id),
    ])
    const names = await loadAuthorNames(db, [...page.messages, ...quoted.values(), ...(pin?.message ? [pin.message] : [])].map((m) => m.author_user_id))
    const toView = (m) => buildStaffGroupMessageView(m, viewer.id, names)
    const seenOf = (m, view) => (view.mine ? { seen: staffGroupSeenCount(m, members, reads) } : {})
    sendJson(res, 200, {
      ...meta,
      pinned: pin?.message ? buildStaffGroupPinned(toView(pin.message), pin.pinned_at) : null,
      messages: page.messages.map((m) => {
        const view = toView(m)
        return { ...view, ...seenOf(m, view), reply: chatReplyQuoteFor(m, quoted, toView, ''), reactions: reactions.get(String(m.id)) ?? [] }
      }),
      has_more: page.has_more,
      marked_read: Boolean(readAt),
      peer_read_at: staffGroupPeerReadAt(reads, viewer.id, members.map((u) => u.id)),
    })
  })
}

export function sendStaffGroupMessage(authCtx, res, clubId, input) {
  return withGroupTable(res, async () => {
    const scope = await groupScope(authCtx, res, clubId)
    if (!scope) return
    const { ctx, db, viewer } = scope
    const checked = resolveChatOutgoing({
      body: input?.body,
      sticker: input?.sticker,
      audio: input?.audio,
      sec: input?.sec,
      wave: input?.wave,
      once: false,
      attach: input?.attach,
    })
    const refused = checked.ok ? chatVoiceBlocked(checked) : checked
    if (refused) {
      sendJson(res, refused.status ?? 400, { error: refused.error })
      return
    }
    const thread = await ensureGroupThread(db, scope.clubId)
    const clientMsgId = normalizeClientMsgId(input?.client_msg_id)
    const earlier = await loadGroupMessageByClientMsgId(db, thread.id, clientMsgId)
    let stored = { voice: null, attach: null }
    if (!earlier) {
      const recent = await countRecentGroupMessages(db, thread.id, viewer.id, chatSendWindowStart(), CHAT_SEND_PER_MINUTE)
      if (isChatSendLimited(recent)) {
        sendJson(res, 429, { error: CHAT_SEND_LIMIT_RU })
        return
      }
      const put = await storeChatOutgoing(checked, { side: 'staff', authorId: viewer.id, msgId: clientMsgId })
      if (!put.ok) {
        sendJson(res, put.status, { error: put.error })
        return
      }
      stored = put
    }
    const target = earlier ? null : await loadReplyTarget(db, 'group', thread.id, input?.reply_to)
    const { message, duplicate } = earlier
      ? { message: earlier, duplicate: true }
      : await insertGroupMessage(db, thread, {
          authorId: viewer.id,
          body: checked.body,
          sticker: checked.sticker,
          clientMsgId,
          replyTo: target?.id ?? null,
          voice: stored.voice,
          attach: stored.attach,
        })
    const quoted = await loadReplyTargets(db, 'group', thread.id, [message])
    const names = await loadAuthorNames(db, [viewer.id, ...[...quoted.values()].map((m) => m.author_user_id)])
    const toView = (m) => buildStaffGroupMessageView(m, viewer.id, names)
    const [members, reads] = await Promise.all([loadMembers(db, scope.clubId), loadGroupReads(db, thread.id)])
    if (!duplicate) {
      sendStaffGroupPush(db, {
        clubId: scope.clubId,
        clubName: scope.clubName,
        memberIds: members.map((u) => u.id),
        mutedIds: reads.filter((r) => r.muted).map((r) => r.user_id),
        authorId: viewer.id,
        authorName: names.get(viewer.id) || String(ctx.profile?.name ?? '').trim(),
        body: checked.body,
        silent: input?.silent === true,
      }).catch((e) => console.warn('[staff-group-push]', e?.message || e))
    }
    sendJson(res, 200, {
      message: { ...toView(message), seen: staffGroupSeenCount(message, members, reads), reply: chatReplyQuoteFor(message, quoted, toView, ''), reactions: [] },
    })
  })
}

export function sendStaffGroupSearch(authCtx, res, clubId, q) {
  return withGroupTable(res, async () => {
    const checked = normalizeChatSearchQuery(q)
    if (!checked.ok) {
      sendJson(res, 400, { error: checked.error })
      return
    }
    const scope = await groupScope(authCtx, res, clubId)
    if (!scope) return
    const thread = await loadGroupThread(scope.db, scope.clubId)
    const found = thread ? await searchThreadMessages(scope.db, 'group', thread.id, checked.q) : []
    const names = await loadAuthorNames(scope.db, found.map((m) => m.author_user_id))
    sendJson(res, 200, { results: found.map((m) => buildChatSearchHit(buildStaffGroupMessageView(m, scope.viewer.id, names), checked.q, '')) })
  })
}

/** @param {'audio'|'text'|'file'} want — file: фото / PDF вложения */
export function sendStaffGroupVoice(authCtx, res, clubId, messageId, want) {
  return withGroupTable(res, async () => {
    const scope = await groupScope(authCtx, res, clubId)
    if (!scope) return
    const thread = await loadGroupThread(scope.db, scope.clubId)
    const threadId = thread?.id ?? null
    const out =
      want === 'file'
        ? await answerChatAttach(scope.db, 'staff_group_messages', threadId, messageId)
        : await answerChatVoice(scope.db, 'staff_group_messages', threadId, messageId, want, `u:${String(authCtx.user?.id ?? scope.viewer.id)}`, {
            userId: scope.viewer.id,
          })
    sendJson(res, out.status, out.body)
  })
}

export function reactStaffGroupMessage(authCtx, res, clubId, input) {
  return withGroupTable(res, async () => {
    const scope = await groupScope(authCtx, res, clubId)
    if (!scope) return
    const thread = await loadGroupThread(scope.db, scope.clubId)
    const out = thread
      ? await setMessageReaction(scope.db, 'group', { threadId: thread.id, messageId: input?.message_id, reactor: chatReactorKey('staff', scope.viewer.id), emoji: input?.emoji })
      : { status: 404, body: { error: CHAT_REACTION_GONE_RU } }
    sendJson(res, out.status, out.body)
  })
}

export function muteStaffGroup(authCtx, res, clubId, muted) {
  return withGroupTable(res, async () => {
    const scope = await groupScope(authCtx, res, clubId)
    if (!scope) return
    const thread = await ensureGroupThread(scope.db, scope.clubId)
    await saveGroupRead(scope.db, thread.id, scope.viewer.id, { muted: muted === true })
    sendJson(res, 200, { muted: muted === true })
  })
}

/** Клубы, чьи чаты видит человек, и число участников в каждом. Главный админ — все клубы. */
async function visibleClubs(db, viewer) {
  if (staffDmRoleOf(viewer.role) === 'admin') {
    const [clubs, staff, { hidden }] = await Promise.all([loadClubs(db), loadNetworkStaff(db), loadLinkedStaffView(db, null)])
    return clubs
      .filter((c) => c.is_active !== false)
      .map((c) => ({ id: String(c.id), name: String(c.name ?? '').trim(), members: pickStaffGroupMembers(staff, c.id, hidden).length }))
  }
  const clubId = String(viewer.club_id ?? '').trim()
  const [name, members] = await Promise.all([loadClubName(db, clubId), loadMembers(db, clubId)])
  return name == null ? [] : [{ id: clubId, name, members: members.length }]
}

/**
 * Строки чатов клубов для списка (у сотрудника — одна, свой клуб); null — роли нет, клуба нет или таблиц ещё нет.
 * @returns {Promise<object[] | null>}
 */
export async function loadStaffGroups(authCtx) {
  const ctx = await staffDmCtx(authCtx)
  const viewer = viewerOf(ctx)
  const role = staffDmRoleOf(viewer.role)
  if (!role || (role !== 'admin' && !String(viewer.club_id ?? '').trim())) return null
  const db = ctx.supabaseAdmin
  try {
    const clubs = await visibleClubs(db, viewer)
    const threads = await loadGroupThreads(db, clubs.map((c) => c.id))
    const reads = await loadUserGroupReads(db, threads.map((t) => t.id), viewer.id)
    const threadOf = new Map(threads.map((t) => [String(t.club_id), t]))
    const readOf = new Map(reads.map((r) => [String(r.thread_id), r]))
    const names = await loadAuthorNames(db, threads.map((t) => t.last_author))
    return Promise.all(
      clubs.map(async (c) => {
        const thread = threadOf.get(c.id) ?? null
        const read = thread ? readOf.get(String(thread.id)) ?? null : null
        const summary = staffGroupSummary({ clubId: c.id, name: c.name, members: c.members, thread, read, unreadCount: 0, viewerId: viewer.id })
        if (!summary.unread) return { ...summary, last_author_name: names.get(String(thread?.last_author ?? '')) ?? '' }
        const unreadCount = await countGroupUnread(db, thread.id, viewer.id, read?.read_at ?? null)
        return { ...summary, unread_count: Math.max(1, unreadCount), last_author_name: names.get(String(thread.last_author)) ?? '' }
      }),
    )
  } catch (e) {
    if (isMissingGroupTable(e)) return null
    throw e
  }
}

/** Незаглушённый чат своего клуба с новым — +1 к числу на конверте. У главного админа чаты клубов в конверт не входят. */
export async function staffGroupsAttention(authCtx) {
  const ctx = await staffDmCtx(authCtx)
  const role = staffDmRoleOf(ctx.profile?.role)
  const clubId = String(ctx.profile?.club_id ?? '').trim()
  if (!role || role === 'admin' || !clubId) return 0
  try {
    const db = ctx.supabaseAdmin
    const viewerId = String(ctx.user?.id ?? '')
    const thread = await loadGroupThread(db, clubId)
    if (!thread) return 0
    const read = await loadGroupRead(db, thread.id, viewerId)
    return staffGroupAttention(staffGroupSummary({ clubId, name: '', members: 0, thread, read, unreadCount: 0, viewerId }))
  } catch (e) {
    if (isMissingGroupTable(e)) return 0
    throw e
  }
}
