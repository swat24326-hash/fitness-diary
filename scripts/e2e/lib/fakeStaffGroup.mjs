/**
 * Подменный чат клуба для автотестов экрана: view group-* / op group-* у admin-data?action=chat и /api/coach.
 * Права, участники, «непрочитано», ✓✓ и push — те же чистые функции, что у staffGroupHandler.
 */
import { hiddenLinkedTrainerIds, linkedPersonNames } from '../../../src/lib/chat/linkedStaffCore.js'
import { chatPreview } from '../../../src/lib/chat/chatMessageCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import { staffDmRoleOf } from '../../../src/lib/chat/staffDmAccessCore.js'
import {
  buildStaffGroupMessageView,
  buildStaffGroupPushPayload,
  pickStaffGroupMembers,
  staffGroupAttention,
  staffGroupClubFor,
  staffGroupPeerReadAt,
  staffGroupPushRecipients,
  staffGroupReadAt,
  staffGroupSummary,
} from '../../../src/lib/chat/staffGroupCore.js'
import {
  STAFF_GROUP_PIN_DENIED_RU,
  STAFF_GROUP_PIN_GONE_RU,
  STAFF_GROUP_READERS_DENIED_RU,
  buildStaffGroupPinned,
  canPinStaffGroup,
  staffGroupReaders,
  staffGroupSeenCount,
} from '../../../src/lib/chat/staffGroupPinCore.js'

/** @param {{ users: object[], clubs?: object[] }} state */
export function createFakeStaffGroup(state) {
  const group = { threads: [], messages: [], reads: [], pushes: [] }
  const viewerOf = (user) => ({ id: String(user?.id ?? ''), role: user?.role, club_id: user?.club_id })
  const clubName = (id) => state.clubs?.find((c) => c.id === id)?.name ?? null
  const members = (clubId) => pickStaffGroupMembers(state.users, clubId, hiddenLinkedTrainerIds(state.users))
  const names = () => {
    const person = linkedPersonNames(state.users)
    return new Map(state.users.map((u) => [String(u.id), person.get(String(u.id)) ?? u.name]))
  }
  const threadOf = (clubId) => group.threads.find((t) => t.club_id === clubId) ?? null
  const readOf = (thread, userId) => (thread ? group.reads.find((r) => r.thread_id === thread.id && r.user_id === userId) ?? null : null)
  const saveRead = (thread, userId, patch) => {
    const row = readOf(thread, userId)
    if (row) Object.assign(row, patch)
    else group.reads.push({ thread_id: thread.id, user_id: userId, read_at: null, muted: false, ...patch })
  }
  const ensureThread = (clubId) => {
    let t = threadOf(clubId)
    if (!t) {
      t = { id: `grp-${group.threads.length + 1}`, club_id: clubId, last_message_at: null, last_author: null, last_preview: '' }
      group.threads.push(t)
    }
    return t
  }

  function scope(user, clubId) {
    const viewer = viewerOf(user)
    const club = staffGroupClubFor(viewer, clubId)
    if (!club.ok) return { error: { status: club.status, json: { error: club.error } } }
    const name = clubName(club.clubId)
    if (name == null) return { error: { status: 404, json: { error: 'Клуб не найден' } } }
    return { viewer, clubId: club.clubId, name }
  }

  /** Как sendStaffGroupThread: вся лента одной страницей. */
  function thread(user, clubId, seen) {
    const s = scope(user, clubId)
    if (s.error) return s.error
    const t = threadOf(s.clubId)
    const read = readOf(t, s.viewer.id)
    const people = members(s.clubId)
    const meta = {
      group: { club_id: s.clubId, name: s.name, members: people.length },
      can_write: true,
      can_pin: canPinStaffGroup(s.viewer),
      muted: read?.muted === true,
      voice_ready: false,
    }
    if (!t) return { status: 200, json: { ...meta, pinned: null, messages: [], has_more: false, marked_read: false, peer_read_at: null } }
    const list = group.messages.filter((m) => m.thread_id === t.id)
    const readAt = chatSeenFromRequest(seen) ? staffGroupReadAt(read, list.at(-1)?.created_at) : null
    if (readAt) saveRead(t, s.viewer.id, { read_at: readAt })
    const n = names()
    const reads = group.reads.filter((r) => r.thread_id === t.id)
    const pinnedMsg = list.find((m) => m.id === t.pinned_message_id)
    const messages = list.map((m) => {
      const view = buildStaffGroupMessageView(m, s.viewer.id, n)
      return { ...view, ...(view.mine ? { seen: staffGroupSeenCount(m, people, reads) } : {}), reply: null, reactions: [] }
    })
    return {
      status: 200,
      json: {
        ...meta,
        pinned: pinnedMsg ? buildStaffGroupPinned(buildStaffGroupMessageView(pinnedMsg, s.viewer.id, n), t.pinned_at) : null,
        messages,
        has_more: false,
        marked_read: Boolean(readAt),
        peer_read_at: staffGroupPeerReadAt(reads, s.viewer.id, people.map((u) => u.id)),
      },
    }
  }

  /** Как pinStaffGroupMessage. */
  function pin(user, clubId, messageId) {
    const s = scope(user, clubId)
    if (s.error) return s.error
    if (!canPinStaffGroup(s.viewer)) return { status: 403, json: { error: STAFF_GROUP_PIN_DENIED_RU } }
    const t = threadOf(s.clubId)
    const m = messageId ? group.messages.find((x) => x.id === messageId && x.thread_id === t?.id) : null
    if (messageId && !m) return { status: 404, json: { error: STAFF_GROUP_PIN_GONE_RU } }
    const at = new Date().toISOString()
    if (t) Object.assign(t, { pinned_message_id: m?.id ?? null, pinned_at: m ? at : null })
    return { status: 200, json: { pinned: m ? buildStaffGroupPinned(buildStaffGroupMessageView(m, s.viewer.id, names()), at) : null } }
  }

  /** Как sendStaffGroupReaders: только у своего сообщения. */
  function readers(user, clubId, messageId) {
    const s = scope(user, clubId)
    if (s.error) return s.error
    const t = threadOf(s.clubId)
    const m = group.messages.find((x) => x.id === messageId && x.thread_id === t?.id)
    if (!m) return { status: 404, json: { error: STAFF_GROUP_PIN_GONE_RU } }
    if (m.author_user_id !== s.viewer.id) return { status: 403, json: { error: STAFF_GROUP_READERS_DENIED_RU } }
    return { status: 200, json: staffGroupReaders(m, members(s.clubId), group.reads.filter((r) => r.thread_id === t.id), names()) }
  }

  /** Как sendStaffGroupMessage; push складываем в group.pushes (по строке на получателя). */
  function send(user, clubId, input) {
    const s = scope(user, clubId)
    if (s.error) return s.error
    const checked = resolveChatOutgoing({ body: input?.body, sticker: input?.sticker })
    if (!checked.ok) return { status: checked.status ?? 400, json: { error: checked.error } }
    const t = ensureThread(s.clubId)
    const at = new Date(Date.now() + group.messages.length).toISOString()
    const m = { id: `gm-${group.messages.length + 1}`, thread_id: t.id, author_user_id: s.viewer.id, body: checked.body, sticker: checked.sticker, created_at: at }
    group.messages.push(m)
    Object.assign(t, { last_message_at: at, last_author: s.viewer.id, last_preview: chatPreview(checked.body) })
    saveRead(t, s.viewer.id, { read_at: at })
    const muted = group.reads.filter((r) => r.thread_id === t.id && r.muted).map((r) => r.user_id)
    const n = names()
    const payload = buildStaffGroupPushPayload({ clubId: s.clubId, clubName: s.name, authorName: n.get(s.viewer.id), body: checked.body })
    for (const to of staffGroupPushRecipients(members(s.clubId).map((u) => u.id), muted, s.viewer.id)) group.pushes.push({ to, ...payload })
    const seen = staffGroupSeenCount(m, members(s.clubId), group.reads.filter((r) => r.thread_id === t.id))
    return { status: 200, json: { message: { ...buildStaffGroupMessageView(m, s.viewer.id, n), seen, reply: null, reactions: [] } } }
  }

  function mute(user, clubId, muted) {
    const s = scope(user, clubId)
    if (s.error) return s.error
    saveRead(ensureThread(s.clubId), s.viewer.id, { muted: muted === true })
    return { status: 200, json: { muted: muted === true } }
  }

  /** Как loadStaffGroups: сотрудник — свой клуб, главный админ — все клубы. */
  function summaries(user) {
    const viewer = viewerOf(user)
    const role = staffDmRoleOf(viewer.role)
    if (!role) return []
    const clubs = role === 'admin' ? (state.clubs ?? []).filter((c) => c.is_active !== false) : (state.clubs ?? []).filter((c) => c.id === viewer.club_id)
    const n = names()
    return clubs.map((c) => {
      const t = threadOf(c.id)
      const read = readOf(t, viewer.id)
      const unreadCount = t ? group.messages.filter((m) => m.thread_id === t.id && m.author_user_id !== viewer.id && (!read?.read_at || m.created_at > read.read_at)).length : 0
      return {
        ...staffGroupSummary({ clubId: c.id, name: c.name, members: members(c.id).length, thread: t, read, unreadCount, viewerId: viewer.id }),
        last_author_name: n.get(String(t?.last_author ?? '')) ?? '',
      }
    })
  }

  const attention = (user) => (staffDmRoleOf(user?.role) === 'admin' ? 0 : summaries(user).reduce((sum, g) => sum + staffGroupAttention(g), 0))

  /** null — не чат клуба, пусть ответит остальная подменная переписка. user — уже «от чьего имени» (связанный управляющий). */
  function handle(req, user) {
    const view = req.searchParams.get('view') ?? ''
    const op = String(req.body?.op ?? '')
    if (req.method === 'GET' && view === 'group-thread') return thread(user, req.searchParams.get('club_id'), req.searchParams.get('seen') ?? undefined)
    if (req.method === 'POST' && op === 'group-send') return send(user, req.body.club_id, req.body)
    if (req.method === 'POST' && op === 'group-mute') return mute(user, req.body.club_id, req.body.muted)
    if (req.method === 'POST' && op === 'group-pin') return pin(user, req.body.club_id, req.body.message_id ?? null)
    if (req.method === 'GET' && view === 'group-readers') return readers(user, req.searchParams.get('club_id'), req.searchParams.get('message_id'))
    if (view.startsWith('group-') || op.startsWith('group-')) return { status: 400, json: { error: 'Не поддержано в подменном сервере' } }
    return null
  }

  return { state: group, handle, summaries, attention }
}
