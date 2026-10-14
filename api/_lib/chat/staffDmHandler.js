/**
 * Переписка сотрудник ↔ сотрудник: /api/coach (view=dm-thread, op dm-send) и admin-data?action=chat (те же view/op).
 * GET  dm-thread&user_id[&before][&seen=0 — не отмечать прочитанным] → { peer: { id, name, label }, can_write, voice_ready, messages, has_more, marked_read, peer_read_at }
 * GET  dm-search&user_id&q → { results } — поиск по диалогу (права — как на чтение)
 * POST { op: 'dm-send', user_id, body | sticker | (audio, sec, wave), reply_to? } → { message } (reply_to — ответ с цитатой, только на сообщение этого диалога)
 * POST { op: 'dm-react', user_id, message_id, emoji|null } → { message_id, reactions }
 * POST { op: 'dm-voice-audio' | 'dm-voice-text', user_id, message_id } → { audio, mime } | { done, text? } (chatVoiceHandler.js)
 * POST { op: 'dm-attach', user_id, message_id } → { data, mime, name } — фото / PDF (сутки, потом 410; chatAttachHandler.js)
 * Текст сообщений в лог не пишем.
 * Тренер, связанный с управляющим (linkedStaffStore), переписывается с коллегами от учётки управляющего.
 */
import { sendJson } from '../adminSupabase.js'
import { chatPeerReadAt, isChatUnreadFor } from '../../../src/lib/chat/chatAccessCore.js'
import {
  CHAT_SEND_LIMIT_RU,
  CHAT_SEND_PER_MINUTE,
  chatSendWindowStart,
  isChatSendLimited,
  normalizeClientMsgId,
} from '../../../src/lib/chat/chatDeliveryCore.js'
import { CHAT_REACTION_GONE_RU, chatReactorKey, chatUnseenReaction } from '../../../src/lib/chat/chatReactionCore.js'
import { chatReplyQuoteFor } from '../../../src/lib/chat/chatReplyCore.js'
import { buildChatSearchHit, normalizeChatSearchQuery } from '../../../src/lib/chat/chatSearchCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import {
  STAFF_DM_NO_ACCESS_RU,
  STAFF_DM_SELF_RU,
  buildStaffDmMessageView,
  canReadStaffDm,
  pickStaffDmPeers,
  staffDmPair,
  staffDmRoleOf,
  staffDmSideOf,
  staffDmThreadForViewer,
  staffDmWriteAccess,
  staffRoleLabelRu,
} from '../../../src/lib/chat/staffDmAccessCore.js'
import { LINKED_ROLE_LABEL_RU } from '../../../src/lib/chat/linkedStaffCore.js'
import { buildStaffContacts } from '../../../src/lib/chat/staffDmContactsCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { isLinkedPairIds, linkedPersonName, loadLinkedStaffView, staffDmCtx } from './linkedStaffStore.js'
import { loadReactionsFor, markReactionSeen, setMessageReaction } from './chatReactionStore.js'
import { loadReplyTarget, loadReplyTargets } from './chatReplyStore.js'
import { searchThreadMessages } from './chatSearchStore.js'
import { sendStaffDmPush } from './staffDmPushJob.js'
import { answerChatAttach, storeChatOutgoing } from './chatAttachHandler.js'
import { answerChatVoice, chatVoiceBlocked } from './chatVoiceHandler.js'
import { chatVoiceStorageMode } from './chatVoiceStorage.js'
import {
  countRecentDmMessages,
  ensureDmThread,
  insertDmMessage,
  isMissingDmTable,
  loadClubStaff,
  loadDmMessageByClientMsgId,
  loadDmUsersByIds,
  loadNetworkStaff,
  loadDmMessages,
  loadDmThread,
  loadDmThreadsFor,
  loadDmUser,
  loadLiveStaffIds,
  markDmRead,
} from './staffDmStore.js'

const UNAVAILABLE_RU = 'Переписка с коллегами пока недоступна — попробуйте позже'

const viewerOf = (ctx) => ({ id: String(ctx.user?.id ?? ''), role: ctx.profile?.role, club_id: ctx.profile?.club_id })

const isIsoCursor = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))

async function loadPeer(ctx, res, peerId) {
  const peer = isInboxUuid(peerId) ? await loadDmUser(ctx.supabaseAdmin, String(peerId).trim()) : null
  if (!peer) sendJson(res, 404, { error: 'Сотрудник не найден' })
  return peer
}

/** Связанные учётки тренер + управляющий — один человек: писать «себе» нельзя, как и с одной учётки. */
async function dmWriteAccess(db, viewer, peer) {
  const access = staffDmWriteAccess(viewer, peer)
  if (access.ok && (await isLinkedPairIds(db, viewer.id, peer.id))) return { ok: false, status: 400, error: STAFF_DM_SELF_RU }
  return access
}

async function withDmTable(res, fn) {
  try {
    await fn()
  } catch (e) {
    if (!isMissingDmTable(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}

/** Имя сотрудника в переписке: у управляющего, связанного с тренерской учёткой, — ФИО из неё. */
async function displayNameOf(db, user) {
  return (await linkedPersonName(db, user.id)) ?? String(user.name ?? '').trim()
}

export function sendStaffDmThread(authCtx, res, peerId, before, seen) {
  return withDmTable(res, async () => {
    const ctx = await staffDmCtx(authCtx)
    const db = ctx.supabaseAdmin
    const viewer = viewerOf(ctx)
    const peer = await loadPeer(ctx, res, peerId)
    if (!peer) return
    const thread = await loadDmThread(db, staffDmPair(viewer.id, peer.id))
    if (!canReadStaffDm(viewer, peer, Boolean(thread))) {
      sendJson(res, 403, { error: STAFF_DM_NO_ACCESS_RU })
      return
    }
    const person = await linkedPersonName(db, peer.id)
    const meta = {
      peer: {
        id: String(peer.id),
        name: person ?? String(peer.name ?? '').trim(),
        label: person ? LINKED_ROLE_LABEL_RU : staffRoleLabelRu(peer.role),
      },
      can_write: (await dmWriteAccess(db, viewer, peer)).ok,
      voice_ready: chatVoiceStorageMode() != null,
    }
    if (!thread) {
      sendJson(res, 200, { ...meta, messages: [], has_more: false, marked_read: false, peer_read_at: null })
      return
    }
    const page = await loadDmMessages(db, thread.id, isIsoCursor(before) ? before : null)
    const view = staffDmThreadForViewer(thread, viewer.id)
    const marked =
      !before &&
      chatSeenFromRequest(seen) &&
      isChatUnreadFor('staff', view) &&
      (await markDmRead(db, thread, staffDmSideOf(thread, viewer.id), page.messages.at(-1)?.created_at))
    const reactor = chatReactorKey('staff', viewer.id)
    const [reactions, quoted] = await Promise.all([
      loadReactionsFor(db, 'dm', page.messages.map((m) => m.id), reactor),
      loadReplyTargets(db, 'dm', thread.id, page.messages),
    ])
    if (!before && chatSeenFromRequest(seen) && chatUnseenReaction('staff', view)) {
      await markReactionSeen(db, 'dm', thread.id, `${staffDmSideOf(thread, viewer.id)}_reaction_seen_at`)
    }
    const toView = (m) => buildStaffDmMessageView(m, viewer.id)
    sendJson(res, 200, {
      ...meta,
      messages: page.messages.map((m) => ({
        ...toView(m),
        reply: chatReplyQuoteFor(m, quoted, toView, meta.peer.name),
        reactions: reactions.get(String(m.id)) ?? [],
      })),
      has_more: page.has_more,
      marked_read: marked,
      peer_read_at: chatPeerReadAt('staff', view),
    })
  })
}

export function sendStaffDmMessage(authCtx, res, peerId, input) {
  return withDmTable(res, async () => {
    const ctx = await staffDmCtx(authCtx)
    const db = ctx.supabaseAdmin
    const viewer = viewerOf(ctx)
    const peer = await loadPeer(ctx, res, peerId)
    if (!peer) return
    const access = await dmWriteAccess(db, viewer, peer)
    if (!access.ok) {
      sendJson(res, access.status, { error: access.error })
      return
    }
    const checked = resolveChatOutgoing({
      body: input?.body,
      sticker: input?.sticker,
      audio: input?.audio,
      sec: input?.sec,
      wave: input?.wave,
      once: input?.once,
      attach: input?.attach,
    })
    const refused = checked.ok ? chatVoiceBlocked(checked) : checked
    if (refused) {
      sendJson(res, refused.status ?? 400, { error: refused.error })
      return
    }
    const thread = await ensureDmThread(db, staffDmPair(viewer.id, peer.id), viewer.club_id || peer.club_id)
    const clientMsgId = normalizeClientMsgId(input?.client_msg_id)
    const earlier = await loadDmMessageByClientMsgId(db, thread.id, clientMsgId)
    let stored = { voice: null, attach: null }
    if (!earlier) {
      const recent = await countRecentDmMessages(db, thread.id, viewer.id, chatSendWindowStart(), CHAT_SEND_PER_MINUTE)
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
    const target = earlier ? null : await loadReplyTarget(db, 'dm', thread.id, input?.reply_to)
    const { message, duplicate } = earlier
      ? { message: earlier, duplicate: true }
      : await insertDmMessage(db, thread, {
          authorId: viewer.id,
          body: checked.body,
          sticker: checked.sticker,
          clientMsgId,
          replyTo: target?.id ?? null,
          voice: stored.voice,
          attach: stored.attach,
        })
    const quoted = await loadReplyTargets(db, 'dm', thread.id, [message])
    const toView = (m) => buildStaffDmMessageView(m, viewer.id)
    const peerName = await displayNameOf(db, peer)
    const view = { ...toView(message), reply: chatReplyQuoteFor(message, quoted, toView, peerName), reactions: [] }
    if (duplicate) {
      sendJson(res, 200, { message: view })
      return
    }
    const authorName = await displayNameOf(db, { id: viewer.id, name: ctx.profile?.name })
    sendStaffDmPush(db, { recipientId: peer.id, authorId: viewer.id, authorName, body: checked.body, silent: input?.silent === true }).catch((e) =>
      console.warn('[staff-dm-push]', e?.message || e),
    )
    sendJson(res, 200, { message: view })
  })
}

/** Поиск по переписке с коллегой: те же права, что на чтение диалога. */
export function sendStaffDmSearch(authCtx, res, peerId, q) {
  return withDmTable(res, async () => {
    const checked = normalizeChatSearchQuery(q)
    if (!checked.ok) {
      sendJson(res, 400, { error: checked.error })
      return
    }
    const ctx = await staffDmCtx(authCtx)
    const db = ctx.supabaseAdmin
    const viewer = viewerOf(ctx)
    const peer = await loadPeer(ctx, res, peerId)
    if (!peer) return
    const thread = await loadDmThread(db, staffDmPair(viewer.id, peer.id))
    if (!canReadStaffDm(viewer, peer, Boolean(thread))) {
      sendJson(res, 403, { error: STAFF_DM_NO_ACCESS_RU })
      return
    }
    const found = thread ? await searchThreadMessages(db, 'dm', thread.id, checked.q) : []
    const peerName = await displayNameOf(db, peer)
    sendJson(res, 200, { results: found.map((m) => buildChatSearchHit(buildStaffDmMessageView(m, viewer.id), checked.q, peerName)) })
  })
}

/** Звук или расшифровка голосового, файл вложения из переписки с коллегой: права — как на чтение диалога. @param {'audio'|'text'|'file'} want */
export function sendStaffDmVoice(authCtx, res, peerId, messageId, want) {
  return withDmTable(res, async () => {
    const ctx = await staffDmCtx(authCtx)
    const db = ctx.supabaseAdmin
    const viewer = viewerOf(ctx)
    const peer = await loadPeer(ctx, res, peerId)
    if (!peer) return
    const thread = await loadDmThread(db, staffDmPair(viewer.id, peer.id))
    if (!canReadStaffDm(viewer, peer, Boolean(thread))) {
      sendJson(res, 403, { error: STAFF_DM_NO_ACCESS_RU })
      return
    }
    const out =
      want === 'file'
        ? await answerChatAttach(db, 'staff_dm_messages', thread?.id ?? null, messageId)
        : await answerChatVoice(db, 'staff_dm_messages', thread?.id ?? null, messageId, want, `u:${String(ctx.user?.id ?? viewer.id)}`, {
            userId: viewer.id,
          })
    sendJson(res, out.status, out.body)
  })
}

/** Своя реакция на сообщение диалога; ставит тот, кто может писать собеседнику. */
export function reactStaffDmMessage(authCtx, res, peerId, input) {
  return withDmTable(res, async () => {
    const ctx = await staffDmCtx(authCtx)
    const db = ctx.supabaseAdmin
    const viewer = viewerOf(ctx)
    const peer = await loadPeer(ctx, res, peerId)
    if (!peer) return
    const access = await dmWriteAccess(db, viewer, peer)
    if (!access.ok) {
      sendJson(res, access.status, { error: access.error })
      return
    }
    const thread = await loadDmThread(db, staffDmPair(viewer.id, peer.id))
    const out = thread
      ? await setMessageReaction(db, 'dm', {
          threadId: thread.id,
          messageId: input?.message_id,
          reactor: chatReactorKey('staff', viewer.id),
          emoji: input?.emoji,
        })
      : { status: 404, body: { error: CHAT_REACTION_GONE_RU } }
    sendJson(res, out.status, out.body)
  })
}

/** Главный админ — вся сеть с названием клуба; сотрудник — свой клуб + главный админ, если тот уже написал. */
async function loadDmCandidates(db, viewer, threads) {
  const role = staffDmRoleOf(viewer.role)
  const clubId = String(viewer.club_id ?? '').trim()
  if (role === 'admin') {
    const [staff, linked] = await Promise.all([loadNetworkStaff(db), loadLinkedStaffView(db, null)])
    return { staff, ...linked }
  }
  const peerIds = threads.map((t) => String(staffDmSideOf(t, viewer.id) === 'lo' ? t.user_hi : t.user_lo))
  const [staff, linked] = await Promise.all([loadClubStaff(db, clubId), loadLinkedStaffView(db, clubId)])
  const known = new Set(staff.map((u) => String(u.id)))
  const outside = await loadDmUsersByIds(db, peerIds.filter((id) => !known.has(id)))
  return { staff: [...staff, ...outside.filter((u) => staffDmRoleOf(u.role) === 'admin')], ...linked, peerIds }
}

/** Связанный управляющий: ФИО из тренерской, «есть приложение» — если оно есть у любой из двух учёток. */
function withLinkedPerson(peers, trainerOf, live) {
  return peers.map((p) => {
    const t = trainerOf.get(String(p.id))
    if (!t) return p
    if (live.has(String(t.id))) live.add(String(p.id))
    return { ...p, name: String(t.name ?? '').trim() || p.name, linked_trainer: true }
  })
}

/**
 * Люди для папок «Коллеги» / «Администрация»; null — роли нет в переписке сотрудников, клуба нет или таблиц ещё нет.
 * @returns {Promise<{ colleagues: object[], admin: object[] } | null>}
 */
export async function loadStaffDmContacts(authCtx) {
  const ctx = await staffDmCtx(authCtx)
  const viewer = viewerOf(ctx)
  const role = staffDmRoleOf(viewer.role)
  if (!role || (role !== 'admin' && !String(viewer.club_id ?? '').trim())) return null
  const db = ctx.supabaseAdmin
  try {
    const threads = await loadDmThreadsFor(db, viewer.id)
    const { staff, hidden, trainerOf, peerIds } = await loadDmCandidates(db, viewer, threads)
    const picked = pickStaffDmPeers(viewer, staff, peerIds).filter((p) => !hidden.has(String(p.id)))
    const linkedIds = picked.map((p) => trainerOf.get(String(p.id))?.id).filter(Boolean)
    const live = await loadLiveStaffIds(db, [...picked.map((p) => p.id), ...linkedIds])
    const peers = withLinkedPerson(picked, trainerOf, live)
    return buildStaffContacts({ viewerId: viewer.id, peers, liveUserIds: live, threads })
  } catch (e) {
    if (isMissingDmTable(e)) return null
    throw e
  }
}

/** Сколько личных диалогов ждут ответа — добавляется к числу на конверте / вкладке «Сообщения». */
export async function staffDmAttention(authCtx) {
  const ctx = await staffDmCtx(authCtx)
  if (!staffDmRoleOf(ctx.profile?.role)) return 0
  try {
    const viewerId = String(ctx.user?.id ?? '')
    const threads = await loadDmThreadsFor(ctx.supabaseAdmin, viewerId)
    return threads.filter((t) => isChatUnreadFor('staff', staffDmThreadForViewer(t, viewerId))).length
  } catch (e) {
    if (isMissingDmTable(e)) return 0
    throw e
  }
}
