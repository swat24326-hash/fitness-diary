/**
 * Звуки переписки, пока приложение открыто. Закрытое приложение звучит системным push.
 * Клиент — включены по умолчанию; сотрудник — выключены (планшет лежит в зале).
 */

export const CHAT_SOUND_STORAGE_KEY = 'fd_chat_sound'

/**
 * @param {string | null} stored '1' | '0' из localStorage
 * @param {'client' | 'staff'} side
 */
export function isChatSoundEnabled(stored, side) {
  if (stored === '1') return true
  if (stored === '0') return false
  return side === 'client'
}

/**
 * Сколько новых сообщений собеседника принёс опрос. Первая загрузка ленты — не «новые».
 * @param {Array<{ id: string }> | null} prev
 * @param {Array<{ id: string, mine: boolean }>} next вид сообщения из buildChatMessageView
 */
export function countNewPeerMessages(prev, next) {
  if (!Array.isArray(prev) || !Array.isArray(next)) return 0
  const seen = new Set(prev.map((m) => m.id))
  return next.filter((m) => !seen.has(m.id) && !m.mine).length
}

/**
 * Конверт сотрудника: звук, только если число выросло после уже известного значения.
 * @param {number | null} prev null — ещё не загружали
 * @param {number} next
 */
export function didInboxCountRise(prev, next) {
  return prev != null && Number(next) > Number(prev)
}
