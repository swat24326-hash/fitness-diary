/**
 * Подменная группа АЗ: view/op az-group-* у планшета и телефона и action az-group-* у клиента.
 * Права, состав, «непрочитано», закреп и push — те же чистые функции, что у сервера.
 */
import { chatPreview } from '../../../src/lib/chat/chatMessageCore.js'
import { chatSeenFromRequest } from '../../../src/lib/chat/chatSeenCore.js'
import { resolveChatOutgoing } from '../../../src/lib/chat/chatStickerCore.js'
import { staffDmRoleOf } from '../../../src/lib/chat/staffDmAccessCore.js'
import {
  AZ_GROUP_NO_ACCESS_RU,
  AZ_GROUP_TITLE_RU,
  azGroupAccess,
  azGroupAttention,
  azGroupMemberIds,
  azGroupParticipantKey,
  azGroupPeerReadAt,
  azGroupPushRecipients,
  azGroupReadAt,
  azGroupSummary,
  buildAzGroupMessageView,
  buildAzGroupPushPayload,
  pickAzGroupMembers,
} from '../../../src/lib/chat/azGroupCore.js'
import {
  AZ_GROUP_PIN_DENIED_RU,
  AZ_GROUP_PIN_GONE_RU,
  AZ_GROUP_READERS_DENIED_RU,
  azGroupReaders,
  azGroupSeenCount,
  buildAzGroupPinned,
  canPinAzGroup,
} from '../../../src/lib/chat/azGroupPinCore.js'

const lower = (v) => String(v ?? '').trim().toLowerCase()

/** @param {{ users: object[], clients: object[], client_az_instructors?: object[] }} state */
export function createFakeAzGroup(state) {
  const az = { threads: [], messages: [], reads: [], pushes: [] }
  const links = () => state.client_az_instructors ?? []
  const linksOf = (instructorId) => links().filter((l) => lower(l.instructor_id) === lower(instructorId))
  const userOf = (id) => state.users.find((u) => lower(u.id) === lower(id)) ?? null
  const membersOf = (instructorId) =>
    pickAzGroupMembers({
      instructorId,
      instructorName: userOf(instructorId)?.name,
      links: linksOf(instructorId),
      clients: state.clients,
    })
  const threadOf = (instructorId) => az.threads.find((t) => lower(t.instructor_user_id) === lower(instructorId)) ?? null
  const readOf = (thread, key) => (thread ? az.reads.find((r) => r.thread_id === thread.id && r.participant === key) ?? null : null)
  const saveRead = (thread, key, patch) => {
    const row = readOf(thread, key)
    if (row) Object.assign(row, patch)
    else az.reads.push({ thread_id: thread.id, participant: key, read_at: null, muted: false, ...patch })
  }
  const ensureThread = (instructorId) => {
    let t = threadOf(instructorId)
    if (!t) {
      const user = userOf(instructorId)
      t = {
        id: `az-${az.threads.length + 1}`,
        instructor_user_id: lower(instructorId),
        club_id: user?.club_id ?? '',
        last_message_at: null,
        last_author_side: null,
        last_author_user_id: null,
        last_author_client_id: null,
        last_preview: '',
        pinned_message_id: null,
        pinned_at: null,
      }
      az.threads.push(t)
    }
    return t
  }
  const names = (instructorId) =>
    new Map(membersOf(instructorId).map((m) => [azGroupParticipantKey({ side: m.side, userId: m.id, clientId: m.id }), m.name]))
  const authorKey = (m) =>
    m?.author_side === 'client'
      ? azGroupParticipantKey({ side: 'client', clientId: m.author_client_id })
      : azGroupParticipantKey({ side: 'user', userId: m.author_user_id })

  function summary(instructorId, viewerKey, withName) {
    const members = membersOf(instructorId)
    const thread = threadOf(instructorId)
    const read = readOf(thread, viewerKey)
    const unreadCount = thread
      ? az.messages.filter((m) => m.thread_id === thread.id && authorKey(m) !== viewerKey && (!read?.read_at || m.created_at > read.read_at)).length
      : 0
    const lastKey = thread?.last_message_at
      ? authorKey({
          author_side: thread.last_author_side,
          author_user_id: thread.last_author_user_id,
          author_client_id: thread.last_author_client_id,
        })
      : ''
    const who = lastKey ? names(instructorId).get(lastKey) : ''
    return azGroupSummary({
      instructorUserId: instructorId,
      instructorName: withName ? userOf(instructorId)?.name : '',
      members: members.length,
      thread,
      read,
      unreadCount,
      viewerKey,
      lastAuthorName: who || '',
    })
  }

  /** Строка в «Клиентах» инструктора. Нет подопечных — null. */
  function summaryForInstructor(user) {
    if (staffDmRoleOf(user?.role) !== 'trainer') return null
    if (!linksOf(user.id).length) return null
    return summary(user.id, azGroupParticipantKey({ side: 'user', userId: user.id }), false)
  }

  function listForClient(clientId) {
    const ids = [...new Set(links().filter((l) => lower(l.client_id) === lower(clientId)).map((l) => lower(l.instructor_id)))]
    const viewerKey = azGroupParticipantKey({ side: 'client', clientId })
    return ids
      .map((id) => summary(id, viewerKey, true))
      .sort((a, b) => Number(b.unread) - Number(a.unread) || String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? '')))
  }

  const attentionStaff = (user) => {
    const row = summaryForInstructor(user)
    return row ? azGroupAttention(row) : 0
  }
  const attentionClient = (clientId) => listForClient(clientId).reduce((n, g) => n + azGroupAttention(g), 0)

  function scopeInstructor(user, requestedId) {
    const viewer = { kind: 'instructor', userId: lower(user?.id) }
    if (staffDmRoleOf(user?.role) !== 'trainer') return { error: { status: 403, json: { error: AZ_GROUP_NO_ACCESS_RU } } }
    const access = azGroupAccess(viewer, { instructorUserId: requestedId || viewer.userId })
    if (!access.ok) return { error: { status: access.status, json: { error: access.error } } }
    return { viewer, instructorUserId: access.instructorUserId, viewerKey: azGroupParticipantKey({ side: 'user', userId: viewer.userId }) }
  }

  function scopeClient(clientId, instructorId) {
    const viewer = { kind: 'client', clientId: lower(clientId) }
    const access = azGroupAccess(viewer, { instructorUserId: instructorId, clientIds: linksOf(instructorId).map((l) => l.client_id) })
    if (!access.ok) return { error: { status: access.status, json: { error: access.error } } }
    return { viewer, instructorUserId: access.instructorUserId, viewerKey: azGroupParticipantKey({ side: 'client', clientId }) }
  }

  function open(scope, seen) {
    const people = membersOf(scope.instructorUserId)
    const t = threadOf(scope.instructorUserId)
    const read = readOf(t, scope.viewerKey)
    const named = userOf(scope.instructorUserId)?.name
    const meta = {
      group: {
        instructor_user_id: scope.instructorUserId,
        name: named ? `${AZ_GROUP_TITLE_RU} · ${named}` : AZ_GROUP_TITLE_RU,
        members: people.length,
      },
      can_write: people.some((m) => m.side === 'client'),
      can_pin: canPinAzGroup(scope.viewer, scope.instructorUserId),
      muted: read?.muted === true,
      voice_ready: false,
    }
    if (!t) return { status: 200, json: { ...meta, pinned: null, messages: [], has_more: false, marked_read: false, peer_read_at: null } }
    const list = az.messages.filter((m) => m.thread_id === t.id)
    const readAt = chatSeenFromRequest(seen) ? azGroupReadAt(read, list.at(-1)?.created_at) : null
    if (readAt) saveRead(t, scope.viewerKey, { read_at: readAt })
    const reads = az.reads.filter((r) => r.thread_id === t.id)
    const who = names(scope.instructorUserId)
    const pinnedMsg = t.pinned_message_id ? list.find((m) => m.id === t.pinned_message_id) : null
    const toView = (m) => buildAzGroupMessageView({ ...m, author_name: who.get(authorKey(m)) || '' }, scope.viewer)
    return {
      status: 200,
      json: {
        ...meta,
        pinned: pinnedMsg ? buildAzGroupPinned(toView(pinnedMsg), t.pinned_at) : null,
        messages: list.map((m) => {
          const view = toView(m)
          return { ...view, ...(view.mine ? { seen: azGroupSeenCount(m, people, reads) } : {}), reply: null, reactions: [] }
        }),
        has_more: false,
        marked_read: Boolean(readAt),
        peer_read_at: azGroupPeerReadAt(reads, scope.viewerKey, azGroupMemberIds(people)),
      },
    }
  }

  function send(scope, input) {
    const people = membersOf(scope.instructorUserId)
    if (!people.some((m) => m.side === 'client')) return { status: 403, json: { error: 'Пока нет подопечных АЗ' } }
    const checked = resolveChatOutgoing(input ?? {})
    if (!checked.ok) return { status: checked.status ?? 400, json: { error: checked.error } }
    const t = ensureThread(scope.instructorUserId)
    const at = new Date(Date.now() + az.messages.length).toISOString()
    const client = scope.viewer.kind === 'client'
    const m = {
      id: `azm-${az.messages.length + 1}`,
      thread_id: t.id,
      author_side: client ? 'client' : 'user',
      author_user_id: client ? null : scope.viewer.userId,
      author_client_id: client ? scope.viewer.clientId : null,
      body: checked.body,
      sticker: checked.sticker ?? null,
      created_at: at,
    }
    az.messages.push(m)
    Object.assign(t, {
      last_message_at: at,
      last_author_side: m.author_side,
      last_author_user_id: m.author_user_id,
      last_author_client_id: m.author_client_id,
      last_preview: chatPreview(checked.body),
    })
    saveRead(t, scope.viewerKey, { read_at: at })
    const reads = az.reads.filter((r) => r.thread_id === t.id)
    const muted = reads.filter((r) => r.muted).map((r) => r.participant)
    const who = names(scope.instructorUserId)
    const authorName = who.get(scope.viewerKey) || ''
    const payloadBase = { instructorUserId: scope.instructorUserId, instructorName: userOf(scope.instructorUserId)?.name, authorName, body: checked.body }
    for (const to of azGroupPushRecipients(azGroupMemberIds(people), muted, scope.viewerKey)) {
      az.pushes.push({
        to,
        ...buildAzGroupPushPayload({ ...payloadBase, forClient: to.startsWith('c:'), title: payloadBase.instructorName ? `${AZ_GROUP_TITLE_RU} · ${payloadBase.instructorName}` : '' }),
      })
    }
    const view = buildAzGroupMessageView({ ...m, author_name: authorName }, scope.viewer)
    return { status: 200, json: { message: { ...view, seen: azGroupSeenCount(m, people, reads), reply: null, reactions: [] } } }
  }

  function pin(scope, messageId) {
    if (!canPinAzGroup(scope.viewer, scope.instructorUserId)) return { status: 403, json: { error: AZ_GROUP_PIN_DENIED_RU } }
    const t = threadOf(scope.instructorUserId)
    const message = messageId ? az.messages.find((m) => m.thread_id === t?.id && m.id === String(messageId)) : null
    if (messageId && !message) return { status: 404, json: { error: AZ_GROUP_PIN_GONE_RU } }
    if (t) Object.assign(t, { pinned_message_id: message?.id ?? null, pinned_at: message ? new Date().toISOString() : null })
    const who = names(scope.instructorUserId)
    const pinned = message ? buildAzGroupPinned(buildAzGroupMessageView({ ...message, author_name: who.get(authorKey(message)) || '' }, scope.viewer), t.pinned_at) : null
    return { status: 200, json: { pinned } }
  }

  function readers(scope, messageId) {
    const t = threadOf(scope.instructorUserId)
    const message = az.messages.find((m) => m.thread_id === t?.id && m.id === String(messageId))
    if (!message) return { status: 404, json: { error: AZ_GROUP_PIN_GONE_RU } }
    if (authorKey(message) !== scope.viewerKey) return { status: 403, json: { error: AZ_GROUP_READERS_DENIED_RU } }
    const reads = az.reads.filter((r) => r.thread_id === t.id)
    return { status: 200, json: azGroupReaders(message, membersOf(scope.instructorUserId), reads, names(scope.instructorUserId)) }
  }

  function mute(scope, muted) {
    saveRead(ensureThread(scope.instructorUserId), scope.viewerKey, { muted: muted === true })
    return { status: 200, json: { muted: muted === true } }
  }

  /** null — не группа АЗ. */
  function handleStaff(req, user) {
    const view = req.searchParams.get('view') ?? ''
    const op = String(req.body?.op ?? '')
    const hit = view.startsWith('az-group-') || op.startsWith('az-group-')
    if (!hit) return null
    const requested = req.method === 'GET' ? req.searchParams.get('instructor_user_id') : req.body?.instructor_user_id
    const scope = scopeInstructor(user, requested)
    if (scope.error) return scope.error
    if (req.method === 'GET' && view === 'az-group-thread') return open(scope, req.searchParams.get('seen') ?? undefined)
    if (req.method === 'GET' && view === 'az-group-readers') return readers(scope, req.searchParams.get('message_id'))
    if (req.method === 'POST' && op === 'az-group-send') return send(scope, req.body)
    if (req.method === 'POST' && op === 'az-group-pin') return pin(scope, req.body?.message_id ?? null)
    if (req.method === 'POST' && op === 'az-group-mute') return mute(scope, req.body?.muted)
    return { status: 400, json: { error: 'Не поддержано в подменном сервере' } }
  }

  /** null — не группа АЗ. */
  function handleClient(clientId, body) {
    const action = String(body?.action ?? '')
    if (!action.startsWith('az-group-')) return null
    if (action === 'az-group-list') return { status: 200, json: { groups: listForClient(clientId) } }
    const scope = scopeClient(clientId, body?.instructor_user_id)
    if (scope.error) return scope.error
    if (action === 'az-group-thread') return open(scope, body?.seen)
    if (action === 'az-group-send') return send(scope, body)
    if (action === 'az-group-pin') return pin(scope, body?.message_id ?? null)
    if (action === 'az-group-mute') return mute(scope, body?.muted)
    if (action === 'az-group-readers') return readers(scope, body?.message_id)
    return { status: 400, json: { error: 'Не поддержано в подменном сервере' } }
  }

  return { state: az, handleStaff, handleClient, summaryForInstructor, attentionStaff, attentionClient }
}
