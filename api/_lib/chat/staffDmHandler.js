/**
 * Переписка сотрудник ↔ сотрудник: /api/coach (view=dm-thread, op dm-send) и admin-data?action=chat (те же view/op).
 * GET  dm-thread&user_id[&before] → { peer: { id, name, label }, can_write, messages, has_more, marked_read, peer_read_at }
 * POST { op: 'dm-send', user_id, body | sticker } → { message }
 * Текст сообщений в лог не пишем.
 * Тренер, связанный с управляющим (linkedStaffStore), переписывается с коллегами от учётки управляющего.
 */
import { sendJson } from '../adminSupabase.js'
import { chatPeerReadAt, isChatUnreadFor } from '../../../src/lib/chat/chatAccessCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import {
  STAFF_DM_NO_ACCESS_RU,
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
import { buildStaffContacts } from '../../../src/lib/chat/staffDmContactsCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { loadHiddenLinkedTrainers, staffDmCtx } from './linkedStaffStore.js'
import { sendStaffDmPush } from './staffDmPushJob.js'
import {
  ensureDmThread,
  insertDmMessage,
  isMissingDmTable,
  loadClubStaff,
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

async function withDmTable(res, fn) {
  try {
    await fn()
  } catch (e) {
    if (!isMissingDmTable(e)) throw e
    sendJson(res, 503, { error: UNAVAILABLE_RU })
  }
}

export function sendStaffDmThread(authCtx, res, peerId, before) {
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
    const meta = {
      peer: { id: String(peer.id), name: String(peer.name ?? '').trim(), label: staffRoleLabelRu(peer.role) },
      can_write: staffDmWriteAccess(viewer, peer).ok,
    }
    if (!thread) {
      sendJson(res, 200, { ...meta, messages: [], has_more: false, marked_read: false, peer_read_at: null })
      return
    }
    const page = await loadDmMessages(db, thread.id, isIsoCursor(before) ? before : null)
    const view = staffDmThreadForViewer(thread, viewer.id)
    const marked = !before && isChatUnreadFor('staff', view)
    if (marked) await markDmRead(db, thread, staffDmSideOf(thread, viewer.id))
    sendJson(res, 200, {
      ...meta,
      messages: page.messages.map((m) => buildStaffDmMessageView(m, viewer.id)),
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
    const access = staffDmWriteAccess(viewer, peer)
    if (!access.ok) {
      sendJson(res, access.status, { error: access.error })
      return
    }
    const checked = resolveChatOutgoing({ body: input?.body, sticker: input?.sticker })
    if (!checked.ok) {
      sendJson(res, 400, { error: checked.error })
      return
    }
    const thread = await ensureDmThread(db, staffDmPair(viewer.id, peer.id), viewer.club_id)
    const message = await insertDmMessage(db, thread, staffDmSideOf(thread, viewer.id), {
      authorId: viewer.id,
      body: checked.body,
      sticker: checked.sticker,
    })
    const authorName = String(ctx.profile?.name ?? '').trim()
    sendStaffDmPush(db, { recipientId: peer.id, authorId: viewer.id, authorName, body: checked.body }).catch((e) =>
      console.warn('[staff-dm-push]', e?.message || e),
    )
    sendJson(res, 200, { message: buildStaffDmMessageView(message, viewer.id) })
  })
}

/**
 * Люди для папок «Коллеги» / «Администрация»; null — роли нет в переписке сотрудников, клуба нет или таблиц ещё нет.
 * @returns {Promise<{ colleagues: object[], admin: object[] } | null>}
 */
export async function loadStaffDmContacts(authCtx) {
  const ctx = await staffDmCtx(authCtx)
  const viewer = viewerOf(ctx)
  const clubId = String(viewer.club_id ?? '').trim()
  if (!staffDmRoleOf(viewer.role) || !clubId) return null
  const db = ctx.supabaseAdmin
  try {
    const [staff, threads, hidden] = await Promise.all([
      loadClubStaff(db, clubId),
      loadDmThreadsFor(db, viewer.id),
      loadHiddenLinkedTrainers(db, clubId),
    ])
    const peers = pickStaffDmPeers(viewer, staff).filter((p) => !hidden.has(String(p.id)))
    const liveUserIds = await loadLiveStaffIds(db, peers.map((p) => p.id))
    return buildStaffContacts({ viewerId: viewer.id, peers, liveUserIds, threads })
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
