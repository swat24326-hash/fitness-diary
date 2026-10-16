/**
 * История диалога «Тренер» после смены clients.trainer_id.
 * Новый тренер не видит переписку предыдущего; главный админ — всю историю.
 * Граница: clients.trainer_chat_since (ставит триггер БД при смене trainer_id).
 */

/** ISO-граница или null (резать не нужно). */
export function trainerChatSinceIso(client) {
  const v = client?.trainer_chat_since
  if (typeof v !== 'string' || !v.trim()) return null
  return Number.isNaN(Date.parse(v)) ? null : v
}

/** Тренер смотрит kind=trainer — применяем since. Админ и другие роли — нет. */
export function staffUsesTrainerChatSince(role, kind) {
  return role === 'trainer' && String(kind ?? '') === 'trainer'
}

export function isChatMessageVisibleAfterSince(message, sinceIso) {
  if (!sinceIso) return true
  const at = message?.created_at
  if (typeof at !== 'string' || !at.trim()) return false
  const t = Date.parse(at)
  const s = Date.parse(sinceIso)
  if (Number.isNaN(t) || Number.isNaN(s)) return false
  return t >= s
}

/**
 * Список диалогов: превью и непрочитанное до границы — как пустой чат для нового тренера.
 * @returns {object} исходная или «пустая» строка thread
 */
export function blankStaffTrainerThreadBeforeSince(thread, sinceIso) {
  if (!sinceIso || !thread) return thread
  const last = thread.last_message_at
  if (typeof last === 'string' && !Number.isNaN(Date.parse(last)) && Date.parse(last) >= Date.parse(sinceIso)) {
    return thread
  }
  return {
    ...thread,
    last_preview: '',
    last_message_at: null,
    last_author: null,
    staff_unread: 0,
    last_reaction_at: null,
    last_reaction_emoji: null,
    last_reaction_by: null,
  }
}
