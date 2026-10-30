/**
 * Кто видит и пишет в диалог клиента. Решает сервер; экран только прячет недоступное.
 * «Тренер» — текущий тренер клиента (clients.trainer_id) + главный админ.
 * «Менеджер по продажам» — общий ящик менеджеров клуба клиента; управляющий клуба и админ тоже отвечают.
 * «Жалобы и предложения» (kind supervisor) — управляющий клуба клиента; админ только читает.
 */

export const CHAT_KINDS = Object.freeze(['trainer', 'sales', 'supervisor'])
/** Инструктор АЗ — отдельный kind + peer_user_id на thread (см. clientAzChatCore). */
export const CHAT_KIND_AZ_INSTRUCTOR = 'az_instructor'

export const CHAT_NO_ACCESS_RU = 'Нет доступа к этой переписке'
export const CHAT_NO_CLUB_RU = 'У вас не задан клуб — обратитесь к администратору'

/** Диалог «supervisor» клиент видит как «Жалобы и предложения» — ящик клуба, читает управляющий. */
const KIND_LABEL_RU = Object.freeze({
  trainer: 'Тренер',
  sales: 'Менеджер по продажам',
  supervisor: 'Жалобы и предложения',
  az_instructor: 'Инструктор АЗ',
})

export function isChatKind(kind) {
  const k = String(kind ?? '')
  return CHAT_KINDS.includes(k) || k === CHAT_KIND_AZ_INSTRUCTOR
}

export function chatKindLabelRu(kind) {
  return KIND_LABEL_RU[kind] ?? 'Сообщения'
}

/** Роль сотрудника для переписки; админ проверяется первым. Пустая или чужая роль — null. */
export function chatStaffRole(ctx) {
  if (ctx?.isAdmin) return 'admin'
  if (ctx?.isTrainer) return 'trainer'
  if (ctx?.isSalesManager) return 'sales'
  if (ctx?.isSupervisor) return 'supervisor'
  return null
}

function ownClub(ctx) {
  return String(ctx?.profile?.club_id ?? '').trim()
}

function sameClub(ctx, client) {
  const own = ownClub(ctx)
  return Boolean(own) && own === String(client?.club_id ?? '').trim()
}

/** Виды диалогов, которые сотрудник видит в принципе (для списка и карточки клиента). */
export function chatKindsForStaff(ctx) {
  switch (chatStaffRole(ctx)) {
    case 'admin':
      return [...CHAT_KINDS, CHAT_KIND_AZ_INSTRUCTOR]
    case 'trainer':
      return ['trainer', CHAT_KIND_AZ_INSTRUCTOR]
    case 'sales':
      return ['sales']
    case 'supervisor':
      return ['sales', 'supervisor']
    default:
      return []
  }
}

/**
 * @param {object} ctx  флаги роли + profile.club_id + user.id
 * @param {string} kind
 * @param {{ club_id?: string, trainer_id?: string|null }} client  текущая строка клиента
 * @param {{ peerUserId?: string|null }} [opts] — для az_instructor: id инструктора
 */
export function canStaffReadChat(ctx, kind, client, opts = {}) {
  if (!isChatKind(kind) || !client) return false
  const role = chatStaffRole(ctx)
  if (role === 'admin') return true
  if (!chatKindsForStaff(ctx).includes(kind)) return false
  if (kind === CHAT_KIND_AZ_INSTRUCTOR) {
    if (role !== 'trainer') return false
    const me = String(ctx?.user?.id ?? '')
    const peer = String(opts?.peerUserId ?? '').trim()
    return Boolean(me) && me === peer
  }
  if (role === 'trainer') {
    const me = String(ctx?.user?.id ?? '')
    return Boolean(me) && me === String(client.trainer_id ?? '')
  }
  return sameClub(ctx, client)
}

/** Клиенту в архиве не пишем: входа в приложение у него нет, история остаётся читаемой. */
export function canStaffWriteChat(ctx, kind, client, opts = {}) {
  if (!canStaffReadChat(ctx, kind, client, opts) || client.archived_at) return false
  return !(chatStaffRole(ctx) === 'admin' && kind === 'supervisor')
}

/** Клиенту диалог с тренером доступен, только если тренер назначен. */
export function clientChatKinds(client) {
  return CHAT_KINDS.filter((k) => k !== 'trainer' || Boolean(client?.trainer_id))
}

/**
 * Кому пуш о новом сообщении.
 * @returns {{ to: 'client' } | { to: 'users', userIds: string[] } | { to: 'roles', roles: string[], clubId: string } | null}
 */
export function chatPushAudience(kind, authorSide, client, opts = {}) {
  if (authorSide === 'staff') return { to: 'client' }
  if (kind === 'trainer') {
    const trainer = String(client?.trainer_id ?? '')
    return trainer ? { to: 'users', userIds: [trainer] } : null
  }
  if (kind === CHAT_KIND_AZ_INSTRUCTOR) {
    const peer = String(opts?.peerUserId ?? '').trim()
    return peer ? { to: 'users', userIds: [peer] } : null
  }
  const clubId = String(client?.club_id ?? '').trim()
  if (!clubId) return null
  return { to: 'roles', roles: [kind === 'sales' ? 'sales' : 'supervisor'], clubId }
}

/** Число на строке диалога (как в Telegram); счётчик мог отстать при гонке — непрочитанный диалог всегда хотя бы 1. */
export function chatUnreadCount(side, thread) {
  if (!isChatUnreadFor(side, thread)) return 0
  return Math.max(1, Number(side === 'client' ? thread.client_unread : thread.staff_unread) || 0)
}

/** Когда другая сторона последний раз открывала диалог — для галочек «прочитано» у своих сообщений. */
export function chatPeerReadAt(side, thread) {
  return (side === 'client' ? thread?.staff_read_at : thread?.client_read_at) ?? null
}

/**
 * Конверт клиента = непрочитанные строки его списка.
 * Диалог «Тренер» без trainer_id не считаем; az_instructor — только назначенные peer (если переданы).
 * @param {Iterable<string>|null|undefined} [azPeerIds]
 */
export function clientChatAttention(client, threads, azPeerIds = null) {
  const kinds = new Set(clientChatKinds(client))
  const peers = azPeerIds == null ? null : new Set([...azPeerIds].map((id) => String(id ?? '').trim()).filter(Boolean))
  return (threads ?? []).filter((t) => {
    if (String(t?.kind) === CHAT_KIND_AZ_INSTRUCTOR) {
      if (peers && !peers.has(String(t.peer_user_id ?? '').trim())) return false
      return isChatUnreadFor('client', t)
    }
    return kinds.has(t.kind) && isChatUnreadFor('client', t)
  }).length
}

/** Для сотрудника клиент в архиве не «ждёт ответа»: написать ему уже нельзя. */
export function isStaffChatUnread(thread, client) {
  return !client?.archived_at && isChatUnreadFor('staff', thread)
}

/** Новое для стороны: последнее сообщение от другой стороны и позже её отметки «прочитано». */
export function isChatUnreadFor(side, thread) {
  if (!thread?.last_message_at || !thread.last_author || thread.last_author === side) return false
  const readAt = side === 'client' ? thread.client_read_at : thread.staff_read_at
  return !readAt || String(readAt) < String(thread.last_message_at)
}
